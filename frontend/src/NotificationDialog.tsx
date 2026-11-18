import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function NotificationDialog({
  message,
  onClose,
  portal = true,
  action,
  durationMs = 8000,
  countdown = false,
}: {
  message: string;
  onClose: () => void;
  /** Render inside an open modal's top layer. */ portal?: boolean;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
  countdown?: boolean;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const timer = window.setTimeout(() => onCloseRef.current(), durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs]);

  const toast = (
    <aside className="app-notification-toast" role="status" aria-live="polite" aria-atomic="true">
      <p>{message}</p>
      {action && (
        <button type="button" className="notification-toast-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      <button
        type="button"
        className="icon-button"
        aria-label="Close notification"
        onClick={onClose}
      >
        ×
      </button>
      {countdown && (
        <span className="notification-toast-countdown" aria-hidden="true">
          <span key={`${message}:${durationMs}`} style={{ animationDuration: `${durationMs}ms` }} />
        </span>
      )}
    </aside>
  );
  return portal ? createPortal(toast, document.body) : toast;
}
