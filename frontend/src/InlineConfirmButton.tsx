import { useId, useState } from 'react';

export function InlineConfirmButton({
  label,
  confirmLabel = 'Confirm delete',
  workingLabel = 'Deleting…',
  confirmationMessage,
  className,
  disabled = false,
  onConfirm,
}: {
  label: string;
  confirmLabel?: string;
  workingLabel?: string;
  confirmationMessage?: string;
  className?: string;
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const messageId = useId();

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
        className={className}
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
      <button type="button" disabled={working} onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </span>
  );
}
