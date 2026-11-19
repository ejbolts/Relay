import { Toast, TOAST_MS } from './Toast';

// eslint-disable-next-line react-refresh/only-export-components
export const STATUS_TOAST_MS = TOAST_MS.status;

/**
 * A brief confirmation, such as "Limits saved", in the shared toast. A new message restarts its
 * countdown.
 */
export function StatusToast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
  /** Ignored: every plain confirmation lasts `TOAST_MS.status`. */
  durationMs?: number;
}) {
  return <Toast id={message} message={message} onDismiss={onClose} />;
}
