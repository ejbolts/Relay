import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export const STATUS_TOAST_MS = 4000;

/**
 * A brief confirmation, such as "Limits saved", in the app's top toast. It floats over the page
 * without moving anything, and clears itself after a few seconds.
 */
export function StatusToast({
  message,
  onClose,
  durationMs = STATUS_TOAST_MS,
}: {
  message: string;
  onClose: () => void;
  durationMs?: number;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const timer = window.setTimeout(() => onCloseRef.current(), durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs]);

  return createPortal(
    <div
      className="undo-toast top-toast"
      role="status"
      aria-atomic="true"
      style={{ '--undo-toast-duration': `${durationMs}ms` } as CSSProperties}
    >
      <span>{message}</span>
      <button
        type="button"
        className="undo-toast-close"
        aria-label="Dismiss notification"
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
    </div>,
    document.body,
  );
}
