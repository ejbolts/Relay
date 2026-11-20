import { useId, useState } from 'react';
import { PopupDialog } from './PopupDialog';
import type { SetEntryWarning } from './setEntryConfirmation';
import './appDialogs.css';

/** Asks before logging a set whose weight or reps look like a typing slip. */
export function SetEntryConfirmationDialog({
  warning,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  warning: SetEntryWarning;
  confirmLabel: string;
  onConfirm: (skipHighRepWarning: boolean) => void;
  onCancel: () => void;
}) {
  const [skipHighRepWarning, setSkipHighRepWarning] = useState(false);
  const messageId = useId();

  return (
    <PopupDialog
      title={warning.title}
      size="compact"
      role="alertdialog"
      className="set-entry-confirmation-dialog"
      describedBy={messageId}
      onClose={onCancel}
      actions={
        <>
          <button type="button" onClick={onCancel}>
            Go back
          </button>
          <button
            type="button"
            className="popup-primary-action confirm-unusual-set"
            autoFocus
            onClick={() => onConfirm(skipHighRepWarning)}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p id={messageId}>{warning.message}</p>
      {warning.highReps && (
        <label className="set-entry-warning-preference">
          <input
            type="checkbox"
            checked={skipHighRepWarning}
            onChange={(event) => setSkipHighRepWarning(event.target.checked)}
          />
          <span>Don't show high-rep warnings again for this workout</span>
        </label>
      )}
    </PopupDialog>
  );
}
