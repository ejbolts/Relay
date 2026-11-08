import type { BodyTrendStatistic } from './bodyTrend';
import { formatWeight, formatWeightNumber, weightFromKg, type WeightUnit } from './weightUnits';

export type BodyHistoryPeriod = 'week' | 'month';

export interface BodyHistoryMeasurement {
  measurement_date: string;
  weight_kg: number;
  body_fat_pct: number | null;
}

export interface BodyHistorySummary {
  start_date: string;
  end_date: string;
  weight_kg: number;
  body_fat_pct: number | null;
  count: number;
}

export interface BodyHistoryGoal {
  start_date: string;
  start_weight_kg: number;
  target_weight_kg: number;
  maintenance_min_kg?: number | null;
  maintenance_max_kg?: number | null;
  created_at?: string;
}

/** Maintain goals use a band or a legacy exact weight. */
export type BodyGoalKind = 'loss' | 'gain' | 'maintain';

export interface BodyHistoryWeightChange {
  direction: 'up' | 'down';
  /** The compared weights in kg, so the amount can be shown in the row's own units and rounding. */
  current_kg: number;
  previous_kg: number;
  status: 'favorable' | 'unfavorable' | 'neutral';
  /** The goal in force on the newer row's date, if any. */
  goalDirection: BodyGoalKind | null;
}

function weightDirection(current: number, previous: number): 'up' | 'down' | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  // Aggregates can differ by floating-point noise even when their weights are equal.
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(current), Math.abs(previous)) * 8;
  if (Math.abs(current - previous) <= tolerance) return null;
  return current > previous ? 'up' : 'down';
}

export function bodyGoalKind(
  goal: Pick<
    BodyHistoryGoal,
    'start_weight_kg' | 'target_weight_kg' | 'maintenance_min_kg' | 'maintenance_max_kg'
  >,
): BodyGoalKind {
  if (maintenanceRange(goal)) return 'maintain';
  const direction = weightDirection(goal.target_weight_kg, goal.start_weight_kg);
  return direction === 'down' ? 'loss' : direction === 'up' ? 'gain' : 'maintain';
}

export function maintenanceRange(goal: {
  maintenance_min_kg?: number | null;
  maintenance_max_kg?: number | null;
}): [number, number] | null {
  const low = goal.maintenance_min_kg;
  const high = goal.maintenance_max_kg;
  return low != null &&
    high != null &&
    Number.isFinite(low) &&
    Number.isFinite(high) &&
    low > 0 &&
    low < high &&
    high <= 500
    ? [low, high]
    : null;
}

export function bodyGoalTarget(goal: BodyHistoryGoal, unit: WeightUnit, decimals = 2): string {
  const range = maintenanceRange(goal);
  return range
    ? `${formatWeightNumber(range[0], unit)}–${formatWeight(range[1], unit)}`
    : formatWeight(goal.target_weight_kg, unit, decimals);
}

export function maintenanceStatus(goal: BodyHistoryGoal, weight: number): string {
  const range = maintenanceRange(goal);
  if (!range) return '';
  return weight < range[0] ? 'Below range' : weight > range[1] ? 'Above range' : 'In range';
}

/** The goal set most recently on or before a date; it stays in force until another replaces it. */
export function bodyGoalOn<G extends BodyHistoryGoal>(goals: G[], date: string): G | null {
  let current: G | null = null;
  for (const goal of goals) {
    if (goal.start_date > date) continue;
    if (
      !current ||
      goal.start_date > current.start_date ||
      (goal.start_date === current.start_date &&
        (goal.created_at ?? '') > (current.created_at ?? ''))
    ) {
      current = goal;
    }
  }
  return current;
}

function changeStatus(
  goal: BodyHistoryGoal | null,
  direction: 'up' | 'down',
  current: number,
  previous: number,
): BodyHistoryWeightChange['status'] {
  if (!goal) return 'neutral';
  const kind = bodyGoalKind(goal);
  if (kind !== 'maintain') {
    return direction === (kind === 'loss' ? 'down' : 'up') ? 'favorable' : 'unfavorable';
  }
  const range = maintenanceRange(goal);
  const distanceFromGoal = (weight: number) =>
    range
      ? Math.max(range[0] - weight, 0, weight - range[1])
      : Math.abs(weight - goal.target_weight_kg);
  const distance = weightDirection(distanceFromGoal(current), distanceFromGoal(previous));
  return distance === 'down' ? 'favorable' : distance === 'up' ? 'unfavorable' : 'neutral';
}

/**
 * Compare newest-first history before pagination, using stored kg rather than display units.
 * Each change is judged against the goal in force on the newer row's date, and `goal_change`
 * marks the oldest row under a goal that differs from the row below it.
 */
export function bodyHistoryWithWeightChanges<
  T extends { weight_kg: number },
  G extends BodyHistoryGoal,
>(
  history: T[],
  goals: G[],
  dateOf: (entry: T) => string,
): (T & { weight_change: BodyHistoryWeightChange | null; goal_change: G | null })[] {
  const entryGoals = history.map((entry) => bodyGoalOn(goals, dateOf(entry)));
  return history.map((entry, index) => {
    const previous = history[index + 1];
    const goal = entryGoals[index];
    const direction = previous ? weightDirection(entry.weight_kg, previous.weight_kg) : null;
    return {
      ...entry,
      weight_change: direction
        ? {
            direction,
            current_kg: entry.weight_kg,
            previous_kg: previous.weight_kg,
            status: changeStatus(goal, direction, entry.weight_kg, previous.weight_kg),
            goalDirection: goal ? bodyGoalKind(goal) : null,
          }
        : null,
      goal_change: previous && goal && goal !== entryGoals[index + 1] ? goal : null,
    };
  });
}

/**
 * The gain or loss between the two rows as they are displayed, so it always matches the
 * difference a reader would work out from the rounded weights.
 */
export function weightChangeAmount(
  change: BodyHistoryWeightChange,
  unit: WeightUnit,
  decimals: number,
  /** Keep trailing zeros, as rows showing a fixed number of decimals do. */
  fixed = false,
): string {
  const shown = (kg: number) => Number(weightFromKg(kg, unit).toFixed(decimals));
  const amount = Math.abs(
    Number((shown(change.current_kg) - shown(change.previous_kg)).toFixed(decimals)),
  );
  if (amount === 0) return `<${(10 ** -decimals).toFixed(decimals)}`;
  return amount.toLocaleString('en-GB', {
    minimumFractionDigits: fixed ? decimals : 0,
    maximumFractionDigits: decimals,
  });
}

function statistic(values: number[], selected: BodyTrendStatistic): number | null {
  if (values.length === 0) return null;
  if (selected === 'average') {
    return values.reduce((total, value) => total + value, 0) / values.length;
  }
  const sorted = values.slice().sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - daysSinceMonday);
  return day.toISOString().slice(0, 10);
}

export function summarizeBodyHistory(
  measurements: BodyHistoryMeasurement[],
  period: BodyHistoryPeriod,
  selected: BodyTrendStatistic,
): BodyHistorySummary[] {
  const groups = new Map<string, BodyHistoryMeasurement[]>();
  for (const measurement of measurements) {
    const key =
      period === 'week'
        ? weekStart(measurement.measurement_date)
        : `${measurement.measurement_date.slice(0, 7)}-01`;
    groups.set(key, [...(groups.get(key) ?? []), measurement]);
  }

  return [...groups.entries()]
    .sort(([first], [second]) => second.localeCompare(first))
    .map(([start_date, entries]) => {
      const end = new Date(`${start_date}T00:00:00Z`);
      if (period === 'week') end.setUTCDate(end.getUTCDate() + 6);
      else end.setUTCMonth(end.getUTCMonth() + 1, 0);
      return {
        start_date,
        end_date: end.toISOString().slice(0, 10),
        weight_kg: statistic(
          entries.map((entry) => entry.weight_kg),
          selected,
        )!,
        body_fat_pct: statistic(
          entries.flatMap((entry) => (entry.body_fat_pct === null ? [] : [entry.body_fat_pct])),
          selected,
        ),
        count: entries.length,
      };
    });
}

/** "Lose to 82 kg", "Gain to 85 kg" or "Maintain 84 kg". */
export function bodyGoalName(goal: BodyHistoryGoal, unit: WeightUnit): string {
  const kind = bodyGoalKind(goal);
  const target = bodyGoalTarget(goal, unit, 1);
  return kind === 'maintain'
    ? `Maintain ${target}`
    : `${kind === 'loss' ? 'Lose' : 'Gain'} to ${target}`;
}
