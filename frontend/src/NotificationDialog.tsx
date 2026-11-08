import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function NotificationDialog({
  message,
  onClose,
  portal = true,
}: {
  message: string;
  onClose: () => void;
  /** Render inside an open modal's top layer. */ portal?: boolean;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const timer = window.setTimeout(() => onCloseRef.current(), 8000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const toast = (
    <aside className="app-notification-toast" role="status" aria-live="polite" aria-atomic="true">
      <p>{message}</p>
      <button
        type="button"
        className="icon-button"
        aria-label="Close notification"
        onClick={onClose}
      >
        ×
      </button>
    </aside>
  );
  return portal ? createPortal(toast, document.body) : toast;
}
