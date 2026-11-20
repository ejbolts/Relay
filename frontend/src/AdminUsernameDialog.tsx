import { useId, useRef, useState, type FormEvent } from 'react';
import { ApiError } from './api';
import { authErrorMessage, validateUsername } from './authForm';
import { PopupDialog } from './PopupDialog';
import type { AdminUser } from './types';

/** Changes someone's username. People cannot change their own, so this is the only way. */
export function AdminUsernameDialog({
  user,
  onSave,
  onClose,
}: {
  user: AdminUser;
  /** Rejects with the server's error, which the dialog shows. */
  onSave: (username: string) => Promise<void>;
  onClose: () => void;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState(user.username);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cleaned = username.trim().toLowerCase();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    const invalid = validateUsername(cleaned);
    if (invalid) {
      setFieldError(invalid);
      input.current?.focus();
      return;
    }
    if (cleaned === user.username) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSave(cleaned);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'username_taken') {
        setFieldError('This username is already registered.');
        input.current?.focus();
      } else setError(authErrorMessage(reason));
      setSaving(false);
    }
  }

  return (
    <PopupDialog
      title={`Change ${user.display_name}’s username`}
      className="field-dialog admin-username-dialog"
      onClose={onClose}
    >
      <form noValidate onSubmit={(event) => void submit(event)}>
        <div className="field-dialog-body">
          <div className="auth-field">
            <label htmlFor={inputId}>Username</label>
            <div className="auth-handle">
              <span className="auth-handle-at" aria-hidden="true">
                @
              </span>
              <input
                ref={input}
                id={inputId}
                name="username"
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                maxLength={32}
                value={username}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? `${inputId}-error` : undefined}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setFieldError(null);
                }}
              />
            </div>
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
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="popup-primary-action"
            disabled={saving}
            aria-busy={saving}
          >
            {saving ? 'Saving…' : 'Save username'}
          </button>
        </footer>
      </form>
    </PopupDialog>
  );
}
