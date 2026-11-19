import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export const EXERCISE_CREATED_TOAST_MS = 5000;

/** Brief confirmation that an exercise joined the library, with a shortcut to it. */
export function ExerciseCreatedToast({
  name,
  onOpen,
  onDismiss,
}: {
  name: string;
  onOpen?: () => void;
  onDismiss: () => void;
}) {
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss.current(), EXERCISE_CREATED_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [name]);

  return createPortal(
    <div
      className="undo-toast top-toast"
      role="status"
      aria-atomic="true"
      style={{ '--undo-toast-duration': `${EXERCISE_CREATED_TOAST_MS}ms` } as CSSProperties}
    >
      <span>{name} added</span>
      {onOpen && (
        <button
          className="undo-toast-action"
          type="button"
          onClick={() => {
            onDismiss();
            onOpen();
          }}
        >
          Open
        </button>
      )}
      <button
        className="undo-toast-close"
        type="button"
        aria-label="Dismiss exercise notification"
        onClick={onDismiss}
      >
        <Icon name="close" />
      </button>
    </div>,
    document.body,
  );
}
