import { bodyGoalKind, maintenanceRange, type BodyGoalKind } from './bodyMeasurementHistory';
import type { BodyWeightGoal, BodyWeightGoalInput } from './types';
import { formatWeight, type WeightUnit } from './weightUnits';

type Checked =
  { error: string; payload?: undefined } | { error: null; payload: BodyWeightGoalInput };

/**
 * What the goal form saves, or why it can't. A new goal starts from the latest weigh-in today;
 * an edited goal keeps where and when it started. A maintenance goal is saved at the middle of
 * its range.
 */
export function bodyGoalPayload({
  kind,
  target,
  minimum,
  maximum,
  targetDate,
  latestKg,
  editing,
  today,
  unit,
}: {
  kind: BodyGoalKind;
  target: number | null;
  minimum: number | null;
  maximum: number | null;
  targetDate: string;
  latestKg: number | null;
  /** The goal being edited, or null for a new goal. */
  editing: BodyWeightGoal | null;
  today: string;
  unit: WeightUnit;
}): Checked {
  const range = maintenanceRange({ maintenance_min_kg: minimum, maintenance_max_kg: maximum });
  if (kind === 'maintain' && !range) {
    return {
      error: `Enter a minimum and a higher maximum, both above 0 and at most ${formatWeight(500, unit)}.`,
    };
  }
  const validTarget = target !== null && Number.isFinite(target) && target > 0 && target <= 500;
  if ((latestKg === null && !editing) || (kind !== 'maintain' && !validTarget) || !targetDate) {
    return { error: 'Log a current weight, target weight, and target date first.' };
  }
  const savedTarget = range && kind === 'maintain' ? (range[0] + range[1]) / 2 : target!;
  const startWeight = editing ? editing.start_weight_kg : latestKg!;
  const direction = bodyGoalKind({ start_weight_kg: startWeight, target_weight_kg: target! });
  if (kind !== 'maintain' && direction !== kind) {
    return {
      error: `For a weight-${kind} goal, choose a target ${kind === 'loss' ? 'below' : 'above'} ${editing ? 'its starting' : 'your current'} ${formatWeight(startWeight, unit)}.`,
    };
  }
  return {
    error: null,
    payload: {
      start_date: editing ? editing.start_date : today,
      target_date: targetDate,
      start_weight_kg: kind === 'maintain' ? savedTarget : startWeight,
      target_weight_kg: savedTarget,
      ...(kind === 'maintain' && range
        ? { maintenance_min_kg: range[0], maintenance_max_kg: range[1] }
        : {}),
      active: true,
    },
  };
}

/** How far a loss or gain goal has come, from 0 to 100. */
export function bodyGoalProgressPercent(
  goal: Pick<BodyWeightGoalInput, 'start_weight_kg' | 'target_weight_kg'>,
  latestKg: number,
): number {
  return Math.min(
    100,
    Math.max(
      0,
      (Math.abs(latestKg - goal.start_weight_kg) /
        Math.max(Math.abs(goal.target_weight_kg - goal.start_weight_kg), 0.1)) *
        100,
    ),
  );
}
