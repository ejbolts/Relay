import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/** A brief confirmation at the top of the screen that clears itself, with an optional action. */
export function TimedToast({
  message,
  durationMs,
  action,
  dismissLabel,
  onDismiss,
  onTimeout = onDismiss,
}: {
  message: string;
  durationMs: number;
  action?: { label: string; run: () => void };
  dismissLabel: string;
  onDismiss: () => void;
  /** Runs when the countdown ends; the toast's owner may already end it at that moment. */
  onTimeout?: (() => void) | null;
}) {
  const timeoutRef = useRef(onTimeout);
  timeoutRef.current = onTimeout;
  useEffect(() => {
    const timer = window.setTimeout(() => timeoutRef.current?.(), durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs]);

  return createPortal(
    <div
      className="undo-toast top-toast"
      role="status"
      style={{ '--undo-toast-duration': `${durationMs}ms` } as CSSProperties}
    >
      <span>{message}</span>
      {action && (
        <button className="undo-toast-action" type="button" onClick={action.run}>
          {action.label}
        </button>
      )}
      <button
        className="undo-toast-close"
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
      >
        <Icon name="close" />
      </button>
    </div>,
    document.body,
  );
}
