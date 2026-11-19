import {
  useCallback,
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from './api';
import { authErrorMessage, MIN_PASSWORD_LENGTH, validateNewPassword } from './authForm';
import { CollapsibleSection } from './CollapsibleSection';
import { Icon } from './Icon';
import { PasswordInput } from './PasswordInput';
import { PopupDialog } from './PopupDialog';
import { ProfileSharingPanel } from './ProfileSharing';
import { hasUnsyncedWorkout } from './sessionCleanup';
import { useUserSession } from './userContext';
import './accountSession.css';

const PASSWORD_TOAST_MS = 5000;

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

function FormFeedback({ error }: { error: string | null }) {
  return (
    <div aria-live="polite" aria-atomic="true">
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** A brief confirmation at the top of the screen that clears by itself. */
function PasswordUpdatedToast({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, PASSWORD_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [onClose]);
  return createPortal(
    <div
      className="undo-toast top-toast"
      role="status"
      aria-atomic="true"
      style={{ '--undo-toast-duration': `${PASSWORD_TOAST_MS}ms` } as CSSProperties}
    >
      <span>Password updated. Other devices were signed out.</span>
      <button
        type="button"
        className="undo-toast-close"
        aria-label="Dismiss password notification"
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
    </div>,
    document.body,
  );
}

function PasswordForm() {
  const id = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  // Counts updates, so each one shows the confirmation afresh.
  const [updated, setUpdated] = useState(0);
  const closeToast = useCallback(() => setUpdated(0), []);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
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
      setUpdated((count) => count + 1);
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
          <PasswordInput
            id={`${id}-current`}
            revealLabel="Show current password"
            autoComplete="current-password"
            enterKeyHint="next"
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
          <PasswordInput
            id={`${id}-new`}
            revealLabel="Show new password"
            autoComplete="new-password"
            enterKeyHint="next"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </Field>
        <Field id={`${id}-confirm`} label="Confirm new password">
          <PasswordInput
            id={`${id}-confirm`}
            revealLabel="Show confirmed password"
            autoComplete="new-password"
            enterKeyHint="go"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
        <FormFeedback error={error} />
        <button
          type="submit"
          className="profile-primary"
          disabled={saving || !current || !next || !confirm}
        >
          {saving && <Spinner />}
          <span>{saving ? 'Updating…' : 'Update password'}</span>
        </button>
      </form>
      {updated > 0 && <PasswordUpdatedToast key={updated} onClose={closeToast} />}
    </CollapsibleSection>
  );
}

type SignOutScope = 'device' | 'everywhere';

function SignOutDialog({
  scope,
  unsynced,
  onCancel,
  onConfirm,
}: {
  scope: SignOutScope;
  unsynced: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const everywhere = scope === 'everywhere';
  return (
    <PopupDialog
      title={everywhere ? 'Sign out everywhere?' : 'Sign out?'}
      kicker="PLEASE CONFIRM"
      className="sign-out-dialog"
      onClose={onCancel}
    >
      {everywhere && <p>Every device signed in to this account will need to sign in again.</p>}
      {unsynced && (
        <p className="sign-out-dialog-warning">
          Sets that haven’t synced yet will be deleted from this device.
        </p>
      )}
      <div className="popup-dialog-actions">
        <button type="button" autoFocus onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="popup-primary-action" onClick={onConfirm}>
          {everywhere ? 'Sign out everywhere' : 'Sign out'}
        </button>
      </div>
    </PopupDialog>
  );
}

function SessionPanel() {
  const { signOut, signOutEverywhere } = useUserSession();
  const [confirming, setConfirming] = useState<{ scope: SignOutScope; unsynced: boolean } | null>(
    null,
  );
  const [signingOut, setSigningOut] = useState<SignOutScope | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(scope: SignOutScope) {
    if (signingOut) return;
    setConfirming(null);
    setSigningOut(scope);
    setError(null);
    try {
      await (scope === 'everywhere' && signOutEverywhere ? signOutEverywhere() : signOut());
    } catch (reason) {
      setError(authErrorMessage(reason));
      setSigningOut(null);
    }
  }

  function start(scope: SignOutScope) {
    const unsynced = hasUnsyncedWorkout();
    // Signing out of this device asks first only when it would delete unsynced sets.
    if (scope === 'device' && !unsynced) void run(scope);
    else setConfirming({ scope, unsynced });
  }

  return (
    <section
      className="settings-panel panel account-session"
      aria-labelledby="profile-session-title"
    >
      <header>
        <div>
          <p className="section-kicker">SESSION</p>
          <h2 id="profile-session-title">Sign out</h2>
        </div>
      </header>
      <button
        type="button"
        className="profile-secondary"
        disabled={signingOut !== null}
        onClick={() => start('device')}
      >
        {signingOut === 'device' && <Spinner />}
        <span>{signingOut === 'device' ? 'Signing out…' : 'Sign out'}</span>
      </button>
      {signOutEverywhere && (
        <button
          type="button"
          className="text-link account-session-everywhere"
          disabled={signingOut !== null}
          onClick={() => start('everywhere')}
        >
          {signingOut === 'everywhere' && <Spinner />}
          <span>
            {signingOut === 'everywhere' ? 'Signing out everywhere…' : 'Sign out everywhere…'}
          </span>
        </button>
      )}
      <FormFeedback error={error} />
      {confirming && (
        <SignOutDialog
          scope={confirming.scope}
          unsynced={confirming.unsynced}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void run(confirming.scope)}
        />
      )}
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
            <PasswordInput
              id={`${id}-password`}
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
          <FormFeedback error={error} />
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
