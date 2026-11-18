import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';

/**
 * Asks the server's admins for a temporary password. The server answers the same way for every
 * username, so the confirmation repeats the username to let a typo be spotted.
 */
export function ForgotPasswordDialog({
  initialUsername,
  onClose,
}: {
  initialUsername: string;
  onClose: () => void;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState(initialUsername.trim());
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
    const name = username.trim().toLowerCase();
    setError(null);
    if (!name) {
      setFieldError('Enter your username.');
      input.current?.focus();
      return;
    }
    setFieldError(null);
    setSending(true);
    try {
      await api.auth.requestPasswordReset(name);
      setSentFor(name);
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setSending(false);
    }
  }

  return (
    <PopupDialog title="Forgot password" className="forgot-password-dialog" onClose={onClose}>
      {sentFor ? (
        <>
          <div className="forgot-password-sent" role="status">
            <span className="forgot-password-sent-icon" aria-hidden="true">
              <Icon name="check" />
            </span>
            <p>
              <strong>Request sent for @{sentFor}</strong>
              Your admin will give you a temporary password.
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
          <div className="forgot-password-body">
            <div className="auth-field">
              <label htmlFor={inputId}>Username</label>
              <input
                ref={input}
                id={inputId}
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                maxLength={32}
                value={username}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? `${inputId}-error` : undefined}
                onChange={(event) => setUsername(event.target.value)}
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
              {sending ? 'Sending…' : 'Ask admin to reset'}
            </button>
          </footer>
        </form>
      )}
    </PopupDialog>
  );
}
