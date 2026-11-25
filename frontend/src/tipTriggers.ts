/**
 * When the logger's actions ask for a tip, shared by the web logger and the app: removing
 * something and soon adding its like again, and the exercises a machine photo tip suits. The
 * timing of what then shows lives in tipScheduling.
 */

/** The latest thing removed from the logger; any later add or undo clears it. */
export type TipRemoval = { kind: 'set' | 'exercise'; key: string; at: number };

/** How soon an add must follow a removal to read as redoing it. */
export const TIP_REMOVAL_WINDOW_MS = 120_000;

type HistoryWorkout = {
  is_sample: boolean;
  movements: { exercise: { id: string }; machine_photos: unknown[] }[];
};

/** Saved workouts, leaving out sample data. */
export function savedWorkoutCount(workouts: { is_sample: boolean }[]): number {
  return workouts.filter((workout) => !workout.is_sample).length;
}

/**
 * Saved workouts for the tips' first-workout gate, leaving out sample data: from the account's
 * total when the dashboard has it, never fewer than the loaded history holds.
 */
export function tipWorkoutCount(
  workouts: { is_sample: boolean }[],
  totalWorkouts: number | undefined,
): number {
  const saved = savedWorkoutCount(workouts);
  return Math.max((totalWorkouts ?? workouts.length) - (workouts.length - saved), saved);
}

/**
 * Choosing exercises soon after removing one reads as replacing it, which Swap exercise does in
 * one go (the swap tip), once there are five saved workouts.
 */
export function replacesRemovedExercise(
  removal: TipRemoval | null,
  selectedCount: number,
  savedWorkouts: number,
  now: number,
): boolean {
  return (
    removal?.kind === 'exercise' &&
    now - removal.at < TIP_REMOVAL_WINDOW_MS &&
    selectedCount > 0 &&
    savedWorkouts >= 5
  );
}

/** Adding a set to an exercise soon after deleting one from it reads as reordering its sets. */
export function readdsRemovedSet(
  removal: TipRemoval | null,
  movementKey: string,
  now: number,
): boolean {
  return (
    removal?.kind === 'set' &&
    removal.key === movementKey &&
    now - removal.at < TIP_REMOVAL_WINDOW_MS
  );
}

/**
 * The machine photo tip suits a machine or cable exercise logged in three saved workouts that no
 * workout (sample ones included) has a machine photo for.
 */
export function machineTipEligible(
  exercise: { id: string; equipment?: string | null },
  workouts: HistoryWorkout[],
): boolean {
  return (
    /machine|cable/i.test(exercise.equipment ?? '') &&
    workouts.filter(
      (workout) =>
        !workout.is_sample && workout.movements.some((item) => item.exercise.id === exercise.id),
    ).length >= 3 &&
    !workouts.some((workout) =>
      workout.movements.some(
        (item) => item.exercise.id === exercise.id && item.machine_photos.length > 0,
      ),
    )
  );
}
