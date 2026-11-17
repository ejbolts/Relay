import { useCallback, useState, type ReactNode } from 'react';
import { api, isWorkoutConflict } from './api';
import type { TrackedWorkout, WorkoutInput } from './types';
import { WorkoutConflictDialog, type WorkoutConflictChoice } from './WorkoutConflictDialog';

/** The user chose the other device's version; their own edits are dropped. */
export class WorkoutEditDiscarded extends Error {}

export const WORKOUT_CONFLICT_UNSAVED =
  'Not saved. This workout was changed on another device; your changes are still here.';

/**
 * Saves an edit and, when the server refuses it because the workout changed elsewhere, asks which
 * version to keep. Render `dialog` while a choice is pending.
 */
export function useWorkoutConflictPrompt(): {
  /**
   * Resolves with the saved workout. Rejects with `WorkoutEditDiscarded` when the latest version
   * is loaded instead, and with an ordinary error when the choice is cancelled.
   */
  saveEdit: (workout: TrackedWorkout, payload: WorkoutInput) => Promise<TrackedWorkout>;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<{
    name: string;
    resolve: (choice: WorkoutConflictChoice) => void;
  } | null>(null);

  const saveEdit = useCallback(async (workout: TrackedWorkout, payload: WorkoutInput) => {
    let attempt = payload;
    for (;;) {
      try {
        return await api.updateWorkout(workout.id, attempt);
      } catch (reason) {
        if (!isWorkoutConflict(reason)) throw reason;
      }
      const choice = await new Promise<WorkoutConflictChoice>((resolve) =>
        setPending({ name: workout.name, resolve }),
      );
      if (choice === 'load-latest') throw new WorkoutEditDiscarded();
      if (choice === 'cancel') throw new Error(WORKOUT_CONFLICT_UNSAVED);
      // Keep mine: save over the version that is on the server now. A change that lands between
      // this read and the save is still caught, and asks again.
      const latest = await api.getWorkout(workout.id);
      attempt = { ...payload, base_revision: latest.revision };
    }
  }, []);

  const dialog = pending ? (
    <WorkoutConflictDialog
      name={pending.name}
      onChoose={(choice) => {
        setPending(null);
        pending.resolve(choice);
      }}
    />
  ) : null;

  return { saveEdit, dialog };
}
