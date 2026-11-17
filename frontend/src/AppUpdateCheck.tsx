import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { UpdateCheckStatus } from './useAppUpdates';

const FEEDBACK_MS = 3000;

export function AppUpdateCheck({
  available,
  status,
  onCheck,
}: {
  available: boolean;
  status: UpdateCheckStatus;
  onCheck: () => void;
}) {
  const requested = useRef(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    checkedAt: Date;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!requested.current || status === 'idle' || status === 'checking') return;
    requested.current = false;
    setFeedback({
      message:
        status === 'error'
          ? 'Could not check for updates. Check your connection and try again.'
          : available
            ? 'Update available. Use the refresh arrow above when you are ready.'
            : 'Up to date',
      checkedAt: new Date(),
      failed: status === 'error',
    });
  }, [status, available]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  return (
    <div className="release-update-check">
      <button
        type="button"
        className="profile-secondary release-settings-action"
        disabled={status === 'checking'}
        onClick={() => {
          requested.current = true;
          setFeedback(null);
          onCheck();
        }}
      >
        {status === 'checking' ? 'Checking for updates…' : 'Check for updates'}
      </button>
      {feedback &&
        createPortal(
          <aside
            className={`release-update-toast${available ? ' has-update' : ''}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={{ '--update-toast-duration': `${FEEDBACK_MS}ms` } as CSSProperties}
          >
            <div>
              <strong>{feedback.message}</strong>
              <time dateTime={feedback.checkedAt.toISOString()}>
                {feedback.failed ? 'Attempted at ' : 'Checked at '}
                {feedback.checkedAt.toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </time>
            </div>
            <button
              type="button"
              aria-label="Dismiss update check notification"
              onClick={() => setFeedback(null)}
            >
              ×
            </button>
            <span className="release-update-countdown" aria-hidden="true">
              <span className="release-update-countdown-fill" />
            </span>
          </aside>,
          document.body,
        )}
    </div>
  );
}
