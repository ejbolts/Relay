import type { WorkoutSetInput } from './types';
import { loggedOnlyWarmups } from './workingSetCheck';
import { isCompletedWorkingSet } from './workoutSets';

/**
 * A folded exercise card's summary, shared by the web logger and the app: how many working sets
 * were logged, or how many warm-ups when only warm-ups were (cardio counts every logged set).
 */
export function foldedMovementSummary(sets: WorkoutSetInput[], cardio: boolean): string {
  if (!cardio && loggedOnlyWarmups(sets)) {
    const warmups = sets.filter((item) => item.completed).length;
    return `${warmups} warm-up ${warmups === 1 ? 'set' : 'sets'}`;
  }
  const done = sets.filter(isCompletedWorkingSet).length;
  return `${done} completed ${done === 1 ? 'set' : 'sets'}`;
}

/** Every working set is ticked, which turns the card's collapse button green. */
export function workingSetsDone(sets: WorkoutSetInput[]): boolean {
  const working = sets.filter((item) => item.set_type !== 'warmup' && !item.warmup);
  return working.length > 0 && working.every((item) => item.completed);
}
