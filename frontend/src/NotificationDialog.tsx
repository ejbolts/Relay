import { Toast } from './Toast';

/** A notice in the shared toast; kept for existing callers until they use `Toast` directly. */
export function NotificationDialog({
  message,
  onClose,
  action,
}: {
  message: string;
  onClose: () => void;
  /** Ignored: the toast moves into an open dialog by itself. */
  portal?: boolean;
  action?: { label: string; onClick: () => void };
  /** Ignored: the duration follows the toast's variant. */
  durationMs?: number;
  /** Ignored: every toast shows its countdown. */
  countdown?: boolean;
}) {
  return (
    <Toast
      id={message}
      message={message}
      action={action && { label: action.label, run: action.onClick }}
      dismissLabel="Close notification"
      onDismiss={onClose}
    />
  );
}
