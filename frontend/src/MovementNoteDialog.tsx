import { useId, useState } from 'react';
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
  const formId = useId();
  return (
    <PopupDialog
      title={exerciseName}
      kicker="EXERCISE NOTE"
      className="movement-note-dialog"
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="popup-primary-action">
            Save note
          </button>
        </>
      }
    >
      <form
        id={formId}
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
      </form>
    </PopupDialog>
  );
}
