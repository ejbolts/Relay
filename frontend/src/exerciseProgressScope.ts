import { TIME_RANGE_OPTIONS, type TimeRange } from './dateRanges';
import { machineFactor } from './machineWeights';
import type { ExerciseProgress, ProgressPoint, WeightMapping } from './types';
import { daysBetween } from './trainingSummary';

const DAYS_PER_MONTH = 30.44;

/**
 * Whether a chart range reaches past a training block: progress scoped to the block could not
 * show it, so choosing the range shows all time instead.
 */
export function rangeOutgrowsBlock(
  range: TimeRange,
  block: { start_date: string; end_date: string | null },
  today: string,
): boolean {
  const months = TIME_RANGE_OPTIONS.find((option) => option.value === range)?.months;
  if (months == null) return true;
  const end = block.end_date && block.end_date < today ? block.end_date : today;
  return months * DAYS_PER_MONTH > daysBetween(block.start_date, end) + 1;
}

/**
 * Each session's best bodyweight ratio in the reference machine's weights, for the normalised
 * "All machines" view. Ratios scale with weight, so each machine's best is multiplied by its
 * conversion, as the view does for weights.
 */
export function withNormalisedRelativeStrength<T extends ProgressPoint>(
  points: T[],
  progress: ExerciseProgress,
  mapping: WeightMapping | null,
): T[] {
  const best = new Map<string, { ratio: number; bodyweight: number | null }>();
  for (const point of progress.machine_points ?? []) {
    if (point.relative_strength == null) continue;
    const ratio = point.relative_strength * machineFactor(mapping, point.machine_photo_id);
    const known = best.get(point.workout_id);
    if (!known || ratio > known.ratio) {
      best.set(point.workout_id, { ratio, bodyweight: point.bodyweight_kg ?? null });
    }
  }
  if (!best.size) return points;
  return points.map((point) => {
    const normalised = best.get(point.workout_id);
    return normalised
      ? {
          ...point,
          relative_strength: Math.round(normalised.ratio * 10_000) / 10_000,
          bodyweight_kg: normalised.bodyweight ?? point.bodyweight_kg,
        }
      : point;
  });
}
