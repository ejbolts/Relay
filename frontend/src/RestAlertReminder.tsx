import { useId, useState } from 'react';
import { PopupDialog } from './PopupDialog';
import { enablePhonePushNotifications } from './push';
import { dismissRestAlertReminder } from './restAlertReminderState';
import { useToast } from './Toast';
import './restAlertReminder.css';

export function RestAlertReminder({ onClose }: { onClose: () => void }) {
  const checkboxId = useId();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  function close() {
    if (enabling) return;
    if (dontShowAgain) dismissRestAlertReminder();
    onClose();
  }

  async function turnOn() {
    if (enabling) return;
    setEnabling(true);
    setError(null);
    try {
      // Called straight from the tap, which browsers require before asking for permission.
      await enablePhonePushNotifications();
      if (dontShowAgain) dismissRestAlertReminder();
      toast.show('Rest alerts on');
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not turn on rest alerts.');
    } finally {
      setEnabling(false);
    }
  }

  return (
    <PopupDialog title="Turn on rest alerts?" className="rest-alert-reminder" onClose={close}>
      <div className="rest-alert-reminder-body">
        <p>Get a notification when your rest is over, even with your phone locked.</p>
        <label className="rest-alert-reminder-dismiss" htmlFor={checkboxId}>
          <input
            id={checkboxId}
            type="checkbox"
            checked={dontShowAgain}
            disabled={enabling}
            onChange={(event) => setDontShowAgain(event.target.checked)}
          />
          <span>Don't show again</span>
        </label>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <footer className="popup-dialog-actions">
          <button type="button" disabled={enabling} onClick={close}>
            Not now
          </button>
          <button
            type="button"
            className="popup-primary-action"
            disabled={enabling}
            onClick={() => void turnOn()}
          >
            {enabling ? 'Turning on…' : 'Turn on'}
          </button>
        </footer>
      </div>
    </PopupDialog>
  );
}
