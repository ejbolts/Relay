import type {
  ExerciseProgress,
  MachineProgressPoint,
  MachineWeight,
  ProgressPoint,
  WeightMapping,
} from './types';

/** Every machine together, or one saved machine's id. */
export type MachineView = 'all' | string;

/** A chart point, with the heaviest set as it was actually logged. */
export interface ProgressViewPoint extends ProgressPoint {
  raw_best_weight_kg: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Multiplier from a machine's weights to the reference machine's. */
export function machineFactor(mapping: WeightMapping | null, machineId: string | null): number {
  if (!mapping?.enabled || !machineId || machineId === mapping.reference_machine_id) return 1;
  const machine = mapping.machines.find((item) => item.id === machineId);
  return machine ? pairFactor(machine) : 1;
}

export function pairFactor(machine: Pick<MachineWeight, 'machine_kg' | 'reference_kg'>): number {
  return machine.machine_kg && machine.reference_kg ? machine.reference_kg / machine.machine_kg : 1;
}

/** Whether the "All machines" view converts weights to the reference machine. */
export function isNormalised(mapping: WeightMapping | null, view: MachineView): boolean {
  return view === 'all' && Boolean(mapping?.enabled && mapping.reference_machine_id);
}

const raw = (point: ProgressPoint): ProgressViewPoint => ({
  ...point,
  raw_best_weight_kg: point.best_weight_kg,
});

/**
 * Points for the chosen view. "All machines" converts each machine's sets when
 * normalising is on; one machine shows its own sessions as logged. Sets without a
 * single pinned machine count as the reference machine.
 */
export function progressViewPoints(
  progress: ExerciseProgress,
  mapping: WeightMapping | null,
  view: MachineView,
): ProgressViewPoint[] {
  const machinePoints = progress.machine_points ?? [];
  if (view !== 'all') {
    const includeUnpinned = Boolean(mapping?.enabled) && view === mapping?.reference_machine_id;
    return machinePoints
      .filter(
        (point) =>
          point.machine_photo_id === view || (includeUnpinned && point.machine_photo_id === null),
      )
      .map(raw);
  }
  if (!isNormalised(mapping, view) || !machinePoints.length) return progress.points.map(raw);

  const byWorkout = new Map<string, MachineProgressPoint[]>();
  for (const point of machinePoints) {
    byWorkout.set(point.workout_id, [...(byWorkout.get(point.workout_id) ?? []), point]);
  }
  return progress.points.map((point) => {
    const groups = byWorkout.get(point.workout_id);
    if (!groups) return raw(point);
    const scaled = groups.map((group) => ({
      group,
      factor: machineFactor(mapping, group.machine_photo_id),
    }));
    const heaviest = scaled.reduce((best, item) =>
      item.group.best_weight_kg * item.factor > best.group.best_weight_kg * best.factor
        ? item
        : best,
    );
    return {
      ...point,
      best_weight_kg: round1(heaviest.group.best_weight_kg * heaviest.factor),
      best_reps: heaviest.group.best_reps,
      best_rpe: heaviest.group.best_rpe,
      raw_best_weight_kg: heaviest.group.best_weight_kg,
      estimated_1rm: round1(
        Math.max(...scaled.map(({ group, factor }) => group.estimated_1rm * factor)),
      ),
      volume_kg: round1(
        scaled.reduce((sum, { group, factor }) => sum + group.volume_kg * factor, 0),
      ),
    };
  });
}

/** Saved machines that have sessions in this exercise's progress, most used first. */
export function machinesWithSessions(
  progress: ExerciseProgress,
  mapping: WeightMapping | null,
): MachineWeight[] {
  if (!mapping) return [];
  const used = new Set((progress.machine_points ?? []).map((point) => point.machine_photo_id));
  if (mapping.enabled && used.has(null) && mapping.reference_machine_id) {
    used.add(mapping.reference_machine_id);
  }
  return mapping.machines
    .filter((machine) => used.has(machine.id))
    .sort((first, second) => second.workout_count - first.workout_count);
}

/** Workouts whose heaviest set beat every earlier one in the view. */
export function runningBestIds(points: ProgressPoint[]): Set<string> {
  const ids = new Set<string>();
  let best = 0;
  for (const point of points) {
    if (point.best_weight_kg > best) {
      best = point.best_weight_kg;
      ids.add(point.workout_id);
    }
  }
  return ids;
}

/**
 * Make another machine the reference, re-expressing every pair against it so each
 * machine's conversion stays the same.
 */
export function withReference(mapping: WeightMapping, referenceId: string): WeightMapping {
  const previousId = mapping.reference_machine_id;
  if (previousId === referenceId) return mapping;
  const next = mapping.machines.find((machine) => machine.id === referenceId);
  const nextFactor = next ? pairFactor(next) : 1;
  return {
    ...mapping,
    reference_machine_id: referenceId,
    machines: mapping.machines.map((machine) => {
      if (machine.id === referenceId) return { ...machine, machine_kg: null, reference_kg: null };
      if (machine.id === previousId) {
        return next?.machine_kg && next.reference_kg
          ? { ...machine, machine_kg: next.reference_kg, reference_kg: next.machine_kg }
          : { ...machine, machine_kg: null, reference_kg: null };
      }
      if (!machine.machine_kg || !machine.reference_kg) return machine;
      return { ...machine, reference_kg: round1(machine.reference_kg / nextFactor) };
    }),
  };
}

/** How far back "recent" machine use reaches when recommending a reference. */
export const RECENT_DAYS = 90;

/** Sessions on each machine in the last three months, up to `today` (YYYY-MM-DD). */
export function recentSessionCounts(
  progress: ExerciseProgress,
  today: string,
): Map<string, number> {
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - RECENT_DAYS);
  const cutoff = since.toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  for (const point of progress.machine_points ?? []) {
    if (!point.machine_photo_id || point.workout_date < cutoff || point.workout_date > today) {
      continue;
    }
    counts.set(point.machine_photo_id, (counts.get(point.machine_photo_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * The machine to recommend as the reference: the one used most in the last three months, so
 * converted numbers read in the weights you lift now. Ties, and exercises with no recent
 * sessions, fall back to the most used machine overall.
 */
export function recommendedReferenceId(
  mapping: WeightMapping,
  recent: Map<string, number>,
): string | null {
  return (
    mapping.machines.reduce<MachineWeight | null>((best, machine) => {
      if (!best) return machine;
      const difference = (recent.get(machine.id) ?? 0) - (recent.get(best.id) ?? 0);
      return difference > 0 || (difference === 0 && machine.workout_count > best.workout_count)
        ? machine
        : best;
    }, null)?.id ?? null
  );
}

export interface FactorSuggestion {
  /** In hundredths. It can fall outside FACTOR_RANGE; the slider clamps it. */
  factor: number;
  /** This machine's sessions that informed the suggestion. */
  sessions: number;
  /** A likely range for the slider, with low <= factor <= high. */
  low: number;
  high: number;
  /**
   * 'trend': two or more sessions compared with the reference trend close by.
   * 'rough': the fallback, from sessions further away or a single session.
   */
  basis: 'trend' | 'rough';
}

/** Interpolate the reference trend between sessions up to this far apart. */
const BRIDGE_DAYS = 56;
/** Otherwise compare with the nearest reference session this close. */
const NEAREST_DAYS = 14;
const MIN_SESSIONS = 2;
/** For rough suggestions, sessions this close together show about the same strength. */
const WINDOW_DAYS = 28;
/** A rough suggestion's likely range reaches at least this share of it either side. */
const ROUGH_SPREAD = 0.05;
const ROUGH_SINGLE_SPREAD = 0.1;
const DAY_MS = 86_400_000;

interface Session {
  machine: string;
  time: number;
  value: number;
}

/** One machine session's conversion, and how far it is from the nearest reference session. */
interface Comparison {
  ratio: number;
  gap: number;
  close: boolean;
}

/** The value a fraction of the way through the sorted values, interpolating between them. */
function quantile(values: number[], fraction: number): number {
  const sorted = values.slice().sort((first, second) => first - second);
  const position = (sorted.length - 1) * fraction;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
}

const hundredths = (value: number) => Math.round(value * 100) / 100;

/** The reference sessions either side of a time; one on the same day is both. */
function neighbours(references: Session[], time: number) {
  const next = references.findIndex((item) => item.time >= time);
  const after = next === -1 ? undefined : references[next];
  const before =
    after?.time === time ? after : references[(next === -1 ? references.length : next) - 1];
  return { before, after };
}

/**
 * The reference trend at a time: interpolated between the sessions either side up to eight weeks
 * apart, or the nearest session within two weeks. Null when no reference session is that close.
 */
function closeLevel(before: Session | undefined, after: Session | undefined, time: number) {
  if (before && after && after.time - before.time <= BRIDGE_DAYS * DAY_MS) {
    const span = after.time - before.time;
    return span
      ? before.value + ((after.value - before.value) * (time - before.time)) / span
      : (before.value + after.value) / 2;
  }
  const nearest = [before, after]
    .filter((item) => item && Math.abs(item.time - time) <= NEAREST_DAYS * DAY_MS)
    .sort((a, b) => Math.abs(a!.time - time) - Math.abs(b!.time - time))[0];
  return nearest?.value ?? null;
}

/**
 * The reference level at any time: interpolated between the sessions either side however far
 * apart, or, before the first or after the last, held at the median of up to three sessions
 * within four weeks of it rather than extending the trend.
 */
function roughLevel(
  references: Session[],
  before: Session | undefined,
  after: Session | undefined,
  time: number,
): number {
  if (before && after && after.time > before.time) {
    return (
      before.value +
      ((after.value - before.value) * (time - before.time)) / (after.time - before.time)
    );
  }
  const edge = (before ?? after)!;
  const distance = (item: Session) => Math.abs(item.time - edge.time);
  const nearby = references
    .filter((item) => distance(item) <= WINDOW_DAYS * DAY_MS)
    .sort((first, second) => distance(first) - distance(second))
    .slice(0, 3)
    .map((item) => item.value);
  return quantile(nearby, 0.5);
}

/** The median conversion, with the middle half of the conversions as the likely range. */
function trendSuggestion(ratios: number[]): FactorSuggestion {
  return {
    factor: hundredths(quantile(ratios, 0.5)),
    sessions: ratios.length,
    low: hundredths(quantile(ratios, 0.25)),
    high: hundredths(quantile(ratios, 0.75)),
    basis: 'trend',
  };
}

/**
 * The fallback for machines without two sessions close to the reference. Strength drifts over a
 * long gap, so only the sessions nearest the reference in time count: those within four weeks of
 * the closest one. After a gym switch, that is the old machine's last few weeks against the new
 * one's first. The likely range is the middle half of their conversions, widened to at least 5%
 * either side, or 10% from a single session.
 */
function roughSuggestion(comparisons: Comparison[]): FactorSuggestion {
  const closest = Math.min(...comparisons.map((item) => item.gap));
  const ratios = comparisons
    .filter((item) => item.gap <= closest + WINDOW_DAYS * DAY_MS)
    .map((item) => item.ratio);
  const median = quantile(ratios, 0.5);
  const spread = median * (ratios.length === 1 ? ROUGH_SINGLE_SPREAD : ROUGH_SPREAD);
  const factor = Math.max(0.01, hundredths(median));
  return {
    factor,
    sessions: ratios.length,
    low: Math.max(0.01, hundredths(Math.min(quantile(ratios, 0.25), median - spread))),
    high: Math.max(factor, hundredths(Math.max(quantile(ratios, 0.75), median + spread))),
    basis: 'rough',
  };
}

/**
 * Suggest each machine's conversion from its logged weights and reps, comparing every session's
 * est. 1RM with the reference machine's level on that date. The median conversion puts the
 * machine's sessions on the reference trend without letting one odd session pull it away.
 *
 * A machine with two or more sessions close to a reference session gets a 'trend' suggestion
 * from those alone (see `closeLevel`). Any other machine with a session gets a 'rough' one (see
 * `roughSuggestion`), as long as the reference has a session. Sessions without a single machine
 * count as the reference.
 */
export function suggestFactors(
  progress: ExerciseProgress,
  referenceId: string | null,
): Map<string, FactorSuggestion> {
  const suggestions = new Map<string, FactorSuggestion>();
  if (!referenceId) return suggestions;
  const sessions = (progress.machine_points ?? [])
    .map((point) => ({
      machine: point.machine_photo_id ?? referenceId,
      time: Date.parse(`${point.workout_date}T00:00:00Z`),
      value: point.estimated_1rm,
    }))
    .filter(
      (session) =>
        session.value > 0 && Number.isFinite(session.value) && Number.isFinite(session.time),
    )
    .sort((first, second) => first.time - second.time);
  const references = sessions.filter((session) => session.machine === referenceId);
  if (!references.length) return suggestions;
  const comparisons = new Map<string, Comparison[]>();
  for (const session of sessions) {
    if (session.machine === referenceId) continue;
    const { before, after } = neighbours(references, session.time);
    const close = closeLevel(before, after, session.time);
    const ratio = (close ?? roughLevel(references, before, after, session.time)) / session.value;
    if (!(ratio > 0 && Number.isFinite(ratio))) continue;
    const gap = Math.min(
      ...[before, after].map((item) => (item ? Math.abs(item.time - session.time) : Infinity)),
    );
    const list = comparisons.get(session.machine) ?? [];
    list.push({ ratio, gap, close: close !== null });
    comparisons.set(session.machine, list);
  }
  for (const [machine, list] of comparisons) {
    const close = list.filter((item) => item.close).map((item) => item.ratio);
    suggestions.set(
      machine,
      close.length >= MIN_SESSIONS ? trendSuggestion(close) : roughSuggestion(list),
    );
  }
  return suggestions;
}

/** The slider's range of conversions, from half to double the reference's weights. */
export const FACTOR_RANGE = { min: 0.5, max: 2, step: 0.01 } as const;

export function clampFactor(factor: number): number {
  return Math.min(FACTOR_RANGE.max, Math.max(FACTOR_RANGE.min, Math.round(factor * 100) / 100));
}

/** The heaviest set from your latest session on a machine, as its default "your weight". */
export function latestWeightKg(progress: ExerciseProgress, machineId: string): number | null {
  let latest: MachineProgressPoint | null = null;
  for (const point of progress.machine_points ?? []) {
    if (point.machine_photo_id !== machineId || point.best_weight_kg <= 0) continue;
    if (!latest || point.workout_date >= latest.workout_date) latest = point;
  }
  return latest?.best_weight_kg ?? null;
}
