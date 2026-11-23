import type { RoutineMovement } from './types';

export function workoutTypeExercisesError(movements: RoutineMovement[]): string | null {
  return movements.some((movement) => movement.sets.some((set) => (set.weight_kg ?? 0) > 10000))
    ? 'Starting weights must be no more than 10,000 kg.'
    : null;
}

export function workoutTypeExercisesPayload(movements: RoutineMovement[]) {
  return {
    // Always send null when a range is cleared, so older client detection can preserve it safely.
    movements: movements.map(({ exercise_id, sets, rep_range }) => ({
      exercise_id,
      sets,
      rep_range: rep_range ?? null,
    })),
  };
}
