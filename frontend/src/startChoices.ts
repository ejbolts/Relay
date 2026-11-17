import type { TrackedWorkout } from './types';

/** How many past workouts are offered to do again. */
const RECENT_WORKOUTS = 5;

/** The latest saved workout of each name, newest first: the ones worth doing again. */
export function recentDistinctWorkouts(
  workouts: TrackedWorkout[],
  limit = RECENT_WORKOUTS,
): TrackedWorkout[] {
  const seen = new Set<string>();
  const recent: TrackedWorkout[] = [];
  for (const workout of [...workouts].sort(
    (left, right) =>
      right.workout_date.localeCompare(left.workout_date) ||
      right.created_at.localeCompare(left.created_at),
  )) {
    const name = workout.name.trim().toLowerCase();
    if (workout.is_sample || !workout.movements.length || seen.has(name)) continue;
    seen.add(name);
    recent.push(workout);
    if (recent.length === limit) break;
  }
  return recent;
}
