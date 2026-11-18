import { useId, useState, type FormEvent } from 'react';
import { api } from './api';
import { AuthBrand } from './AuthScreen';
import { authErrorMessage, MIN_PASSWORD_LENGTH, validateNewPassword } from './authForm';
import { useUserSession } from './userContext';

/**
 * Shown instead of the app after an admin resets the account's password: the temporary password
 * is the "current" one, and nothing else works until a new password replaces it.
 */
export function PasswordChangeRequired() {
  const { user, updateUser, signOut } = useUserSession();
  const id = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    if (!current) {
      setError('Enter the temporary password.');
      return;
    }
    const passwordError = validateNewPassword(next);
    if (passwordError) {
      setError(`New password: ${passwordError.toLowerCase()}`);
      return;
    }
    if (next !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.changePassword({ current_password: current, new_password: next });
    } catch (reason) {
      setSaving(false);
      setError(authErrorMessage(reason));
      return;
    }
    // The password is saved; a failed refresh only means the next sign-in check confirms it.
    const refreshed = await api.auth.me().catch(() => null);
    if (refreshed) updateUser(refreshed);
    else if (user) updateUser({ ...user, must_change_password: false });
  }

  return (
    <main className="auth-screen">
      <div className="auth-shell">
        <AuthBrand />
        <section className="auth-card" aria-label="Choose a new password">
          <h2 className="auth-card-title">Choose a new password</h2>
          <form noValidate onSubmit={(event) => void submit(event)}>
            <div className="auth-field">
              <label htmlFor={`${id}-current`}>Temporary password</label>
              <input
                id={`${id}-current`}
                type="password"
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
              />
            </div>
            <div className="auth-field">
              <label htmlFor={`${id}-new`}>New password</label>
              <input
                id={`${id}-new`}
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={next}
                onChange={(event) => setNext(event.target.value)}
              />
              <small className="auth-hint">At least {MIN_PASSWORD_LENGTH} characters.</small>
            </div>
            <div className="auth-field">
              <label htmlFor={`${id}-confirm`}>Confirm new password</label>
              <input
                id={`${id}-confirm`}
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            <div className="auth-error-region" aria-live="polite" aria-atomic="true">
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <button type="submit" className="auth-submit" disabled={saving} aria-busy={saving}>
              {saving && <span className="auth-spinner" aria-hidden="true" />}
              <span>{saving ? 'Saving…' : 'Save password'}</span>
            </button>
            <button
              type="button"
              className="auth-sample-profile"
              disabled={saving}
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
