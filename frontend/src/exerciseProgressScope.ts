import { TIME_RANGE_OPTIONS, type TimeRange } from './dateRanges';
import {
  isNormalised,
  machineFactor,
  machinesWithSessions,
  progressViewPoints,
  runningBestIds,
  type MachineView,
  type ProgressViewPoint,
} from './machineWeights';
import { personalBestProgressPoint } from './progressChart';
import { recordsForBlock } from './trainingBlocks';
import { daysBetween, isCountedRecord } from './trainingSummary';
import type {
  ExerciseProgress,
  MachineWeight,
  PersonalRecord,
  ProgressPoint,
  TrainingBlock,
  WeightMapping,
} from './types';

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

/**
 * An exercise's progress as its screen shows it, for every machine together or one machine:
 * the sessions, personal bests and record markers. "All machines" is in the reference machine's
 * weights while normalising is on, marked "≈". A machine without sessions here falls back to
 * all machines. `recordWorkoutIds` are the workouts with a counted record for the exercise,
 * marked in the default view; other views mark each new heaviest set instead.
 */
export function exerciseProgressView(
  progress: ExerciseProgress | null,
  mapping: WeightMapping | null,
  machine: MachineView,
  recordWorkoutIds: ReadonlySet<string>,
) {
  const machineOptions: MachineWeight[] = progress ? machinesWithSessions(progress, mapping) : [];
  const view: MachineView = machineOptions.some((item) => item.id === machine) ? machine : 'all';
  const normalised = isNormalised(mapping, view);
  const referenceMachine = normalised
    ? mapping?.machines.find((item) => item.id === mapping.reference_machine_id)
    : undefined;
  const points: ProgressViewPoint[] = progress ? progressViewPoints(progress, mapping, view) : [];
  const defaultView = view === 'all' && !normalised;
  const best = (metric: 'best_weight_kg' | 'estimated_1rm' | 'volume_kg') =>
    personalBestProgressPoint(points, metric) as ProgressViewPoint | null;
  const bestEstimate = best('estimated_1rm');
  const relativePoints =
    progress && normalised ? withNormalisedRelativeStrength(points, progress, mapping) : points;
  return {
    machineOptions,
    view,
    normalised,
    referenceMachine,
    points,
    defaultView,
    /** Put before converted weights. */
    approx: normalised ? '≈ ' : '',
    heaviest: best('best_weight_kg'),
    bestEstimate,
    bestVolume: best('volume_kg'),
    bestEstimatedOneRepMax: defaultView
      ? (progress?.personal_best_estimated_1rm ?? 0)
      : (bestEstimate?.estimated_1rm ?? 0),
    relativeBest: relativePoints.reduce<ProgressViewPoint | null>(
      (top, point) =>
        (point.relative_strength ?? 0) > (top?.relative_strength ?? 0) ? point : top,
      null,
    ),
    recordIds: defaultView ? recordWorkoutIds : runningBestIds(points),
  };
}

/** The workouts with a counted record for an exercise, in the chosen training block if any. */
export function exerciseRecordWorkoutIds(
  records: PersonalRecord[],
  block: TrainingBlock | null,
  exerciseId: string,
): Set<string> {
  return new Set(
    recordsForBlock(records, block)
      .filter((record) => record.exercise_id === exerciseId && isCountedRecord(record))
      .map((record) => record.workout_id),
  );
}
