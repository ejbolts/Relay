import { useState } from 'react';
import { PopupDialog } from './PopupDialog';

/** Writes the note kept with an exercise in this workout, which History shows with it. */
export function MovementNoteDialog({
  exerciseName,
  value,
  onSave,
  onClose,
}: {
  exerciseName: string;
  value: string;
  onSave: (notes: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <PopupDialog
      title={exerciseName}
      kicker="EXERCISE NOTE"
      className="movement-note-dialog"
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draft.trim());
        }}
      >
        <textarea
          aria-label={`Note for ${exerciseName}`}
          value={draft}
          maxLength={2000}
          rows={3}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="popup-dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="popup-primary-action">
            Save note
          </button>
        </div>
      </form>
    </PopupDialog>
  );
}
