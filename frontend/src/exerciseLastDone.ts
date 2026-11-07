import type { ExerciseHistoryBaseline, TrackedWorkout } from './types';

/**
 * The latest workout date for each exercise, from the loaded workouts and the condensed
 * history before them. The workout being edited or resumed is left out, so an exercise
 * reads as last done in an earlier session rather than in the one open now.
 */
export function exerciseLastDoneDates(
  workouts: readonly TrackedWorkout[],
  olderHistory: ReadonlyMap<string, ExerciseHistoryBaseline> | null,
  excludedWorkoutId: string | null = null,
): Map<string, string> {
  const dates = new Map<string, string>();
  const record = (exerciseId: string, date: string) => {
    const current = dates.get(exerciseId);
    if (!current || date > current) dates.set(exerciseId, date);
  };
  olderHistory?.forEach((baseline, exerciseId) => {
    if (baseline.latest && baseline.latest.workout_id !== excludedWorkoutId) {
      record(exerciseId, baseline.latest.workout_date);
    }
  });
  workouts.forEach((workout) => {
    if (workout.id === excludedWorkoutId) return;
    workout.movements.forEach((movement) => record(movement.exercise.id, workout.workout_date));
  });
  return dates;
}

/** Day and month within the current year ("5 Nov"); month and year before it ("Mar 2025"). */
export function formatLastDone(date: string, today: string, locale?: string): string {
  const value = new Date(`${date}T12:00:00`);
  return value.toLocaleDateString(
    locale,
    date.slice(0, 4) === today.slice(0, 4)
      ? { day: 'numeric', month: 'short' }
      : { month: 'short', year: 'numeric' },
  );
}
