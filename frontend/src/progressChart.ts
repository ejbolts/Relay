import { dateRangeForDates, type TimeRange } from './dateRanges';
import type { ProgressPoint } from './types';

export type ProgressMetric = 'estimated_1rm' | 'best_weight_kg' | 'volume_kg';

export function personalBestProgressPoint(
  points: ProgressPoint[],
  metric: ProgressMetric,
): ProgressPoint | null {
  return points.reduce<ProgressPoint | null>((best, point) => {
    const value = point[metric];
    if (!Number.isFinite(value) || value <= 0) return best;
    if (!best || value > best[metric]) return point;
    if (value === best[metric] && point.workout_date > best.workout_date) return point;
    return best;
  }, null);
}

export function progressPointsForChart<T extends ProgressPoint>(
  points: T[],
  metric: ProgressMetric,
  range: TimeRange,
): T[] {
  const ordered = points
    .filter((point) => Number.isFinite(point[metric]) && point[metric] > 0)
    .slice()
    .sort(
      (first, second) =>
        first.workout_date.localeCompare(second.workout_date) ||
        first.workout_id.localeCompare(second.workout_id),
    );
  const { start_date: cutoff } = dateRangeForDates(
    ordered.map((point) => point.workout_date),
    range,
  );
  return cutoff ? ordered.filter((point) => point.workout_date >= cutoff) : ordered;
}
