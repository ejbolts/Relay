import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { authErrorMessage } from './authForm';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';

interface AdminRequestDialogProps {
  title: string;
  className: string;
  /** The one field: what identifies the account. */
  label: string;
  name: string;
  autoComplete: string;
  autoCapitalize: 'none' | 'words';
  maxLength: number;
  initialValue?: string;
  /** Shown under the field when it is left empty. */
  emptyError: string;
  /** The value as it is sent and repeated in the confirmation. */
  clean: (value: string) => string;
  send: (value: string) => Promise<void>;
  submitLabel: string;
  /** Repeats what was sent, so a typo can be spotted. */
  sentTitle: (value: string) => string;
  sentMessage: string;
  onClose: () => void;
}

/**
 * Asks the server's admins for help signing in. The server answers the same way whatever was
 * typed, so the confirmation repeats it to let a typo be spotted.
 */
export function AdminRequestDialog({
  title,
  className,
  label,
  name,
  autoComplete,
  autoCapitalize,
  maxLength,
  initialValue = '',
  emptyError,
  clean,
  send,
  submitLabel,
  sentTitle,
  sentMessage,
  onClose,
}: AdminRequestDialogProps) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue.trim());
  const [sending, setSending] = useState(false);
  const [sentFor, setSentFor] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // The form, and the button that had focus, are replaced by the confirmation.
    if (sentFor) done.current?.focus();
  }, [sentFor]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const cleaned = clean(value);
    setError(null);
    if (!cleaned) {
      setFieldError(emptyError);
      input.current?.focus();
      return;
    }
    setFieldError(null);
    setSending(true);
    try {
      await send(cleaned);
      setSentFor(cleaned);
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setSending(false);
    }
  }

  return (
    <PopupDialog title={title} className={`admin-request-dialog ${className}`} onClose={onClose}>
      {sentFor ? (
        <>
          <div className="admin-request-sent" role="status">
            <span className="admin-request-sent-icon" aria-hidden="true">
              <Icon name="check" />
            </span>
            <p>
              <strong>{sentTitle(sentFor)}</strong>
              {sentMessage}
            </p>
          </div>
          <footer className="popup-dialog-actions">
            <button ref={done} type="button" className="popup-primary-action" onClick={onClose}>
              Done
            </button>
          </footer>
        </>
      ) : (
        <form noValidate onSubmit={(event) => void submit(event)}>
          <div className="admin-request-body">
            <div className="auth-field">
              <label htmlFor={inputId}>{label}</label>
              <input
                ref={input}
                id={inputId}
                name={name}
                type="text"
                autoComplete={autoComplete}
                autoCapitalize={autoCapitalize}
                autoCorrect="off"
                spellCheck={false}
                required
                maxLength={maxLength}
                value={value}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? `${inputId}-error` : undefined}
                onChange={(event) => {
                  setValue(event.target.value);
                  // The empty-field error no longer applies once something is typed.
                  setFieldError(null);
                }}
              />
              {fieldError && (
                <small id={`${inputId}-error`} className="auth-field-error">
                  {fieldError}
                </small>
              )}
            </div>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <footer className="popup-dialog-actions">
            <button type="button" disabled={sending} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="popup-primary-action"
              disabled={sending}
              aria-busy={sending}
            >
              {sending ? 'Sending…' : submitLabel}
            </button>
          </footer>
        </form>
      )}
    </PopupDialog>
  );
}
