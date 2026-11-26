import type { FinishedWorkout } from './finishedWorkoutQueue';
import { isPendingWorkoutId } from './pendingWorkoutPreview';
import type { HeatmapDay } from './types';

// Plain functions with no React or browser APIs: the web and the native app (mobile/) both
// decide here whether a saved workout can change and how its deletion shows before it is sent.

/** Shown when a workout still waiting to sync is edited or deleted. */
export const WORKOUT_SYNCING_MESSAGE = 'You can change this workout once it has synced.';

/** The saved workouts that have changes on this device still waiting to reach the server. */
export function queuedWorkoutIds(items: readonly Pick<FinishedWorkout, 'pendingSave'>[]) {
  return new Set(
    items.flatMap((item) => (item.pendingSave.workoutId ? [item.pendingSave.workoutId] : [])),
  );
}

/**
 * Whether a workout can't be edited or deleted yet: one the server hasn't confirmed, or one with
 * changes still waiting to sync, which would otherwise land over (or bring back) the change.
 */
export function workoutBlockedWhileSyncing(id: string, queued: ReadonlySet<string>): boolean {
  return isPendingWorkoutId(id) || queued.has(id);
}

/**
 * The calendar's days without the given workouts, as they show while a deletion waits for its
 * Undo: a day keeps its other workouts, with its counts, categories and types worked out again,
 * and a day left with none drops out.
 */
export function heatmapWithoutWorkouts(
  days: readonly HeatmapDay[],
  ids: readonly string[],
): HeatmapDay[] {
  if (!ids.length) return days as HeatmapDay[];
  const removed = new Set(ids);
  return days.flatMap((day) => {
    const workouts = Array.isArray(day.workouts) ? day.workouts : [];
    if (!workouts.some((workout) => removed.has(workout.id))) return [day];
    const kept = workouts.filter((workout) => !removed.has(workout.id));
    if (!kept.length) return [];
    const gone = workouts.filter((workout) => removed.has(workout.id));
    const typeId = (workout: (typeof workouts)[number]) =>
      workout.workout_type_id ?? workout.workout_type?.id ?? workout.category;
    return [
      {
        ...day,
        workouts: kept,
        workout_count: Math.max(kept.length, day.workout_count - gone.length),
        set_count: Math.max(
          0,
          day.set_count -
            gone.reduce(
              (sum, workout) =>
                sum +
                (workout.exercises ?? []).reduce((sets, exercise) => sets + exercise.set_count, 0),
              0,
            ),
        ),
        categories: day.categories.filter((category) =>
          kept.some((workout) => workout.category === category),
        ),
        ...(day.workout_types
          ? {
              workout_types: day.workout_types.filter((type) =>
                kept.some((workout) => typeId(workout) === type.id),
              ),
            }
          : {}),
      },
    ];
  });
}
