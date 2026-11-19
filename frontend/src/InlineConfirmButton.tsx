import { useId, useState } from 'react';

/**
 * A destructive button that asks again in place. `className` styles the first button only; the
 * confirm step always looks the same: the danger fill beside a secondary Cancel.
 */
export function InlineConfirmButton({
  label,
  confirmLabel = 'Confirm delete',
  workingLabel = 'Deleting…',
  confirmationMessage,
  className,
  size = 'small',
  disabled = false,
  onConfirm,
}: {
  label: string;
  confirmLabel?: string;
  workingLabel?: string;
  confirmationMessage?: string;
  className?: string;
  /** Size of the confirm and Cancel buttons: small in rows and cards, default in forms. */
  size?: 'small' | 'default';
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const messageId = useId();
  const sizeClass = size === 'small' ? ' small' : '';

  if (!confirming) {
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <span
      className="inline-confirmation"
      role="group"
      aria-label={`${label} confirmation`}
      aria-describedby={confirmationMessage ? messageId : undefined}
    >
      {confirmationMessage && (
        <small className="inline-confirmation-message" id={messageId}>
          {confirmationMessage}
        </small>
      )}
      <button
        type="button"
        className={`pulse-button danger${sizeClass}`}
        disabled={disabled || working}
        onClick={() => {
          setWorking(true);
          void Promise.resolve()
            .then(onConfirm)
            .catch(() => undefined)
            .finally(() => {
              setWorking(false);
              setConfirming(false);
            });
        }}
      >
        {working ? workingLabel : confirmLabel}
      </button>
      <button
        type="button"
        className={`pulse-button secondary${sizeClass}`}
        disabled={working}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </button>
    </span>
  );
}
