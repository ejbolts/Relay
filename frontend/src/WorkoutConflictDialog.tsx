import { useState } from 'react';
import { PopupDialog } from './PopupDialog';
import type { WorkoutConflictChoice } from './workoutConflict';

export type { WorkoutConflictChoice };

/** Shown when a save is refused because the workout was saved on another device meanwhile. */
export function WorkoutConflictDialog({
  name,
  onChoose,
}: {
  name: string;
  onChoose: (choice: WorkoutConflictChoice) => void;
}) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  return (
    <PopupDialog
      title="Changed on another device"
      className="workout-conflict-dialog workout-finish-dialog"
      size="compact"
      onClose={() => onChoose('cancel')}
      onBack={confirmingDiscard ? () => setConfirmingDiscard(false) : undefined}
      actionsClassName="workout-finish-actions"
      actions={
        confirmingDiscard ? (
          <>
            {/* Keyed, so each step's safe choice mounts fresh and takes focus. */}
            <button key="back" type="button" autoFocus onClick={() => setConfirmingDiscard(false)}>
              Back
            </button>
            <button
              type="button"
              className="popup-primary-action is-danger"
              onClick={() => onChoose('load-latest')}
            >
              Discard my changes
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setConfirmingDiscard(true)}>
              Load latest
            </button>
            <button
              key="keep-mine"
              type="button"
              className="popup-primary-action"
              autoFocus
              onClick={() => onChoose('keep-mine')}
            >
              Keep my version
            </button>
          </>
        )
      }
    >
      {confirmingDiscard ? (
        <p>Discard the changes you made here and load the latest “{name}”?</p>
      ) : (
        <p>
          “{name}” was saved on another device after you opened it here. Keeping your version
          replaces those changes.
        </p>
      )}
    </PopupDialog>
  );
}
