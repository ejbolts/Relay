import { useState } from 'react';
import { PopupDialog } from './PopupDialog';

export type WorkoutConflictChoice = 'keep-mine' | 'load-latest' | 'cancel';

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
      kicker="NOT SAVED YET"
      className="workout-conflict-dialog workout-finish-dialog"
      onClose={() => onChoose('cancel')}
    >
      {confirmingDiscard ? (
        <>
          <p>Discard the changes you made here and load the latest “{name}”?</p>
          <div className="popup-dialog-actions workout-finish-actions">
            <button type="button" autoFocus onClick={() => setConfirmingDiscard(false)}>
              Back
            </button>
            <button
              type="button"
              className="popup-primary-action"
              onClick={() => onChoose('load-latest')}
            >
              Discard my changes
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            “{name}” was saved on another device after you opened it here. Keeping your version
            replaces those changes.
          </p>
          <div className="popup-dialog-actions workout-finish-actions">
            <button type="button" onClick={() => setConfirmingDiscard(true)}>
              Load latest
            </button>
            <button
              type="button"
              className="popup-primary-action"
              autoFocus
              onClick={() => onChoose('keep-mine')}
            >
              Keep my version
            </button>
          </div>
        </>
      )}
    </PopupDialog>
  );
}
