import { useEffect, useId, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { enablePhonePushNotifications } from './push';
import { dismissRestAlertReminder } from './restAlertReminderState';
import './restAlertReminder.css';

const CONFIRMATION_MS = 3000;

export function RestAlertReminder({ onClose }: { onClose: () => void }) {
  const checkboxId = useId();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(onClose, CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, onClose]);

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
      setEnabled(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not turn on rest alerts.');
    } finally {
      setEnabling(false);
    }
  }

  if (enabled) {
    return createPortal(
      <div
        className="undo-toast top-toast"
        role="status"
        aria-atomic="true"
        style={{ '--undo-toast-duration': `${CONFIRMATION_MS}ms` } as CSSProperties}
      >
        <span>Rest alerts on</span>
        <button
          className="undo-toast-close"
          type="button"
          aria-label="Dismiss rest alerts notification"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>,
      document.body,
    );
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
