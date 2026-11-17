import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { authErrorMessage, MIN_PASSWORD_LENGTH, validateNewPassword } from './authForm';
import { CollapsibleSection } from './CollapsibleSection';
import { ProfileSharingPanel } from './ProfileSharing';
import { useUserSession } from './userContext';

function Spinner() {
  return <span className="auth-spinner" aria-hidden="true" />;
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <small className="auth-hint">{hint}</small>}
    </div>
  );
}

function FormFeedback({ status, error }: { status: string | null; error: string | null }) {
  return (
    <div aria-live="polite" aria-atomic="true">
      {status && (
        <p className="notification-setting-status" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function PasswordForm() {
  const id = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setStatus(null);
    setError(null);
    if (!current) {
      setError('Enter your current password.');
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
      setCurrent('');
      setNext('');
      setConfirm('');
      setStatus('Password updated.');
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.code === 'invalid_password'
          ? 'Your current password is not correct.'
          : authErrorMessage(reason),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection
      className="settings-panel panel account-password"
      kicker="SECURITY"
      title="Change password"
    >
      <form className="profile-form" noValidate onSubmit={(event) => void save(event)}>
        <Field id={`${id}-current`} label="Current password">
          <input
            id={`${id}-current`}
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </Field>
        <Field
          id={`${id}-new`}
          label="New password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        >
          <input
            id={`${id}-new`}
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </Field>
        <Field id={`${id}-confirm`} label="Confirm new password">
          <input
            id={`${id}-confirm`}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
        <FormFeedback status={status} error={error} />
        <button
          type="submit"
          className="profile-primary"
          disabled={saving || !current || !next || !confirm}
        >
          {saving && <Spinner />}
          <span>{saving ? 'Updating…' : 'Update password'}</span>
        </button>
      </form>
    </CollapsibleSection>
  );
}

function SessionPanel() {
  const { signOut } = useUserSession();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);
    try {
      await signOut();
    } catch (reason) {
      setError(authErrorMessage(reason));
      setSigningOut(false);
    }
  }

  return (
    <section className="settings-panel panel" aria-labelledby="profile-session-title">
      <header>
        <div>
          <p className="section-kicker">SESSION</p>
          <h2 id="profile-session-title">Sign out all devices</h2>
        </div>
      </header>
      <p>Clears cached data and unfinished workouts on each device when it next connects.</p>
      <button
        type="button"
        className="profile-secondary"
        disabled={signingOut}
        onClick={() => void run()}
      >
        {signingOut && <Spinner />}
        <span>{signingOut ? 'Signing out…' : 'Sign out all devices'}</span>
      </button>
      <FormFeedback status={null} error={error} />
    </section>
  );
}

function DangerZone() {
  const id = useId();
  const { accountDeleted } = useUserSession();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setOpen(false);
    setPassword('');
    setConfirmed(false);
    setError(null);
  }

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleting || !password || !confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteAccount(password);
    } catch (reason) {
      setError(authErrorMessage(reason));
      setDeleting(false);
      return;
    }
    // The account is gone; a cleanup problem must not leave the user on a dead screen.
    await accountDeleted().catch(() => window.location.reload());
  }

  return (
    <section className="settings-panel panel danger-zone" aria-labelledby={`${id}-title`}>
      <header>
        <div>
          <p className="section-kicker">DANGER ZONE</p>
          <h2 id={`${id}-title`}>Delete account</h2>
        </div>
      </header>
      <p>
        Permanently deletes your account and every workout, measurement, photo, and video attached
        to it. This cannot be undone.
      </p>
      {open ? (
        <form className="profile-form" noValidate onSubmit={(event) => void remove(event)}>
          <Field id={`${id}-password`} label="Confirm with your password">
            <input
              id={`${id}-password`}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <label className="profile-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>I understand my account and all of its data will be deleted forever.</span>
          </label>
          <FormFeedback status={null} error={error} />
          <div className="profile-button-row">
            <button
              type="button"
              className="profile-secondary"
              disabled={deleting}
              onClick={cancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="profile-danger"
              disabled={deleting || !password || !confirmed}
            >
              {deleting && <Spinner />}
              <span>{deleting ? 'Deleting…' : 'Delete account'}</span>
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="profile-danger" onClick={() => setOpen(true)}>
          Delete account…
        </button>
      )}
    </section>
  );
}

/** Points an administrator from the profile badge to feedback waiting in the admin console. */
export function FeedbackReviewPanel({
  openFeedback,
  onOpenAdmin,
}: {
  openFeedback: number;
  onOpenAdmin: () => void;
}) {
  return (
    <section className="settings-panel panel" aria-labelledby="profile-feedback-title">
      <header>
        <div>
          <p className="section-kicker">ADMIN</p>
          <h2 id="profile-feedback-title">
            {openFeedback} feedback {openFeedback === 1 ? 'message' : 'messages'} to review
          </h2>
        </div>
      </header>
      <p>Read and resolve what members sent from Settings or the app guide.</p>
      <button type="button" className="profile-secondary" onClick={onOpenAdmin}>
        Review feedback
      </button>
    </section>
  );
}

export function AccountSettings({
  openFeedback = 0,
  onOpenAdmin,
}: {
  openFeedback?: number;
  onOpenAdmin?: () => void;
}) {
  const { user } = useUserSession();
  if (!user) return null;

  return (
    <>
      {onOpenAdmin && openFeedback > 0 && (
        <FeedbackReviewPanel openFeedback={openFeedback} onOpenAdmin={onOpenAdmin} />
      )}
      <ProfileSharingPanel />
      <PasswordForm />
    </>
  );
}

export function AccountSessionSettings() {
  return (
    <>
      <SessionPanel />
      <DangerZone />
    </>
  );
}
