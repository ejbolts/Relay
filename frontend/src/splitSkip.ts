import { currentSplitStep, nextTrainingStep, splitDayTypeIds } from './trainingSplit';
import type { TrainingSplit, WorkoutRecommendation, WorkoutType } from './types';

// Plain functions with no React or browser APIs: Home's Skip on the web and in the native app
// (mobile/) both decide the move here. Keep this file and its imports free of packages and DOM
// access; the mobile checks build them too.

export interface SplitSkipMove {
  split: TrainingSplit;
  /** Up next's split step today. */
  from: number;
  /** The next workout day after it, which the skip moves the split to. */
  to: number;
}

/**
 * Up next's split day and the workout day after it, while that day can be skipped: the split is
 * on, Up next is its day today (not a later scheduled one, and not waiting for an update), and
 * another workout day follows.
 */
export function splitSkipMove(
  split: TrainingSplit | null | undefined,
  recommendation: WorkoutRecommendation | null | undefined,
  needsSplitUpdate: boolean,
  today: string,
): SplitSkipMove | null {
  if (!split?.enabled || !recommendation?.split_name || needsSplitUpdate) return null;
  if (recommendation.scheduled_date && recommendation.scheduled_date > today) return null;
  const from = currentSplitStep(split, today);
  if (from === null) return null;
  const to = nextTrainingStep(split, from);
  return to === from ? null : { split, from, to };
}

/** A split step's workout type names ("Upper body + Cardio" on a mixed day), or "rest day". */
export function splitDayName(split: TrainingSplit, step: number, types: WorkoutType[]) {
  const typeIds = splitDayTypeIds(split.steps[step]);
  if (!typeIds.length) return 'rest day';
  return typeIds.map((id) => types.find((type) => type.id === id)?.name ?? 'workout').join(' + ');
}

/** The confirmation after a skip, such as "Skipped Upper body · Lower body is up next". */
export function splitSkipMessage({ split, from, to }: SplitSkipMove, types: WorkoutType[]) {
  return `Skipped ${splitDayName(split, from, types)} · ${splitDayName(split, to, types)} is up next`;
}
