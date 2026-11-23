// Saving an edit to a workout that another device saved meanwhile: the server refuses it with
// `workout_conflict`, and the person chooses which version to keep. The web's
// useWorkoutConflictPrompt and the native app (mobile/) both use these.

/** The choices after a conflicting save: keep this version, load the other, or neither yet. */
export type WorkoutConflictChoice = 'keep-mine' | 'load-latest' | 'cancel';

/** Said when the choice is put off: nothing was saved, and the changes are still open. */
export const WORKOUT_CONFLICT_UNSAVED =
  'Not saved. This workout was changed on another device; your changes are still here.';

/** Whether a failed save was refused because the workout changed on another device. */
export function isWorkoutConflictError(reason: unknown): boolean {
  const error = reason as { status?: unknown; code?: unknown } | null;
  return (
    typeof error === 'object' &&
    error !== null &&
    error.status === 409 &&
    error.code === 'workout_conflict'
  );
}
