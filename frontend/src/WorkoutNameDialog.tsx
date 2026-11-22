import { useId } from 'react';
import { PopupDialog } from './PopupDialog';
import './appDialogs.css';

/** Names the live workout; a blank name falls back to the workout type's name. */
export function WorkoutNameDialog({
  value,
  fallbackName,
  onChange,
  onCancel,
  onSave,
}: {
  value: string;
  fallbackName: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const formId = useId();
  const descriptionId = useId();

  return (
    <PopupDialog
      title="Name this workout"
      className="workout-name-dialog"
      describedBy={descriptionId}
      onClose={onCancel}
      actions={
        <>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" form={formId} className="popup-primary-action">
            Save name
          </button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <p id={descriptionId}>
          Give this session a name, or leave it blank to use “{fallbackName}”.
        </p>
        <label>
          Workout name
          <input
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={fallbackName}
            maxLength={120}
          />
        </label>
      </form>
    </PopupDialog>
  );
}
