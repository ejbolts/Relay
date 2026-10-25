import { useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  DEFAULT_AUTH_CONFIG,
  MIN_PASSWORD_LENGTH,
  submitAuthForm,
  type AuthFieldErrors,
  type AuthMode,
} from './authForm';
import { queueHomeScreenGuide } from './homeScreenGuideState';
import { queueAppGuide } from './appGuideState';
import { motionReduced } from './motion';
import { SampleProfileDialog } from './SampleProfileDialog';
import type { AuthConfig, User } from './types';

interface AuthScreenProps {
  /** Null while the public config is still loading; the form falls back to safe defaults. */
  config: AuthConfig | null;
  onAuthenticated: (user: User) => Promise<void> | void;
  initialMode?: AuthMode;
  /** Signed in: the screen plays its exit above the app, then calls `onExited`. */
  exiting?: boolean;
  onExited?: () => void;
}

/** The whole exit: the card closes, the logo glides to the centre and fades, then the screen
 *  fades. Matches the screen animation in auth.css. */
export const AUTH_EXIT_MS = 1500;
const AUTH_EXIT_REDUCED_MS = 250;

/**
 * The logo's glide, as fractions of AUTH_EXIT_MS. It runs through the Web Animations API with
 * measured pixel distances: Safari does not pick up a CSS variable set as its keyframes start.
 */
function brandMarkExit(shift: number): Keyframe[] {
  const centred = `translateY(${shift}px) scale(1.04)`;
  return [
    { offset: 0, transform: 'translateY(0) scale(1)', opacity: 1 },
    {
      offset: 0.24,
      transform: 'translateY(0) scale(1)',
      opacity: 1,
      easing: 'cubic-bezier(0.45, 0, 0.2, 1)',
    },
    { offset: 0.6, transform: centred, opacity: 1 },
    { offset: 0.66, transform: centred, opacity: 1, easing: 'ease-in' },
    // Gone before the screen starts fading at 82% (auth.css), so it never overlaps the app.
    { offset: 0.8, transform: `translateY(${shift}px) scale(1.1)`, opacity: 0 },
    { offset: 1, transform: `translateY(${shift}px) scale(1.1)`, opacity: 0 },
  ];
}

function Spinner() {
  return <span className="auth-spinner" aria-hidden="true" />;
}

function AuthField({
  id,
  label,
  error,
  hint,
  help,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** A short explanation shown under the label when its ? button is tapped. */
  help?: ReactNode;
  children: ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <div className="auth-field">
      {help ? (
        <div className="auth-label-row">
          <label htmlFor={id}>{label}</label>
          <button
            type="button"
            className="auth-help-button"
            aria-label={`About ${label.toLowerCase()}`}
            aria-expanded={helpOpen}
            aria-controls={`${id}-help`}
            onClick={() => setHelpOpen((current) => !current)}
          >
            ?
          </button>
        </div>
      ) : (
        <label htmlFor={id}>{label}</label>
      )}
      {help && (
        <p id={`${id}-help`} className="auth-help" hidden={!helpOpen}>
          {help}
        </p>
      )}
      {children}
      {hint && !error && (
        <small id={`${id}-hint`} className="auth-hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={`${id}-error`} className="auth-field-error">
          {error}
        </small>
      )}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: string): string | undefined {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

export function AuthBrand() {
  return (
    <header className="auth-brand">
      <div className="auth-brand-mark">
        <img src="/relay-logo.png" alt="" width={72} height={72} />
        <h1>Relay</h1>
      </div>
      <p>Log every set, track every PR.</p>
    </header>
  );
}

export function AuthScreen({
  config,
  onAuthenticated,
  initialMode = 'sign-in',
  exiting = false,
  onExited,
}: AuthScreenProps) {
  const effectiveConfig = config ?? DEFAULT_AUTH_CONFIG;
  const registrationOpen = effectiveConfig.registration_open;
  const idPrefix = useId();
  const [requestedMode, setMode] = useState<AuthMode>(initialMode);
  const mode: AuthMode = registrationOpen ? requestedMode : 'sign-in';
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [inviteRevealed, setInviteRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [sampleOpen, setSampleOpen] = useState(false);

  const screenRef = useRef<HTMLElement>(null);
  const shellTopRef = useRef<number | null>(null);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  useLayoutEffect(() => {
    if (!exiting) return;
    const screen = screenRef.current;
    const shell = screen?.querySelector<HTMLElement>('.auth-shell');
    const mark = screen?.querySelector<HTMLElement>('.auth-brand-mark');
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
    const reduced = motionReduced();
    let glide: Animation | undefined;
    if (shell && mark) {
      // The screen is now a fixed overlay; keep the form where it was on screen.
      const offset =
        (shellTopRef.current ?? shell.getBoundingClientRect().top) -
        shell.getBoundingClientRect().top;
      shell.style.transform = `translateY(${offset}px)`;
      if (!reduced && typeof mark.animate === 'function') {
        const box = mark.getBoundingClientRect();
        const shift = window.innerHeight / 2 - (box.top + box.height / 2);
        glide = mark.animate(brandMarkExit(shift), { duration: AUTH_EXIT_MS, fill: 'forwards' });
      }
    }
    const timer = window.setTimeout(
      () => onExitedRef.current?.(),
      reduced ? AUTH_EXIT_REDUCED_MS : AUTH_EXIT_MS,
    );
    return () => {
      window.clearTimeout(timer);
      glide?.cancel();
    };
  }, [exiting]);

  const creating = mode === 'create-account';
  const showInviteCode = creating && (effectiveConfig.invite_code_required || inviteRevealed);
  const ids = {
    name: `${idPrefix}-name`,
    username: `${idPrefix}-username`,
    password: `${idPrefix}-password`,
    invite: `${idPrefix}-invite`,
  };

  function switchMode(next: AuthMode) {
    if (submitting || next === mode) return;
    setMode(next);
    setError(null);
    setNotice(null);
    setFieldErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    setFieldErrors({});
    const result = await submitAuthForm(
      mode,
      { displayName, username, password, inviteCode },
      effectiveConfig,
    );
    if (result.ok) {
      if (mode === 'create-account') {
        queueHomeScreenGuide(result.user.id);
        queueAppGuide(result.user.id);
        setMode('sign-in');
        setDisplayName('');
        setUsername('');
        setPassword('');
        setInviteCode('');
        setShowPassword(false);
        setInviteRevealed(false);
        setNotice('Account created. Sign in with your username and password.');
        setSubmitting(false);
        window.requestAnimationFrame(() => document.getElementById(ids.username)?.focus());
        return;
      }
      shellTopRef.current =
        screenRef.current?.querySelector('.auth-shell')?.getBoundingClientRect().top ?? null;
      try {
        await onAuthenticated(result.user);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setSubmitting(false);
    setError(result.message);
    setFieldErrors(result.fieldErrors);
    if (result.needsInviteCode) setInviteRevealed(true);
    const firstInvalid = (['displayName', 'username', 'password', 'inviteCode'] as const).find(
      (field) => result.fieldErrors[field],
    );
    const target = {
      displayName: ids.name,
      username: ids.username,
      password: ids.password,
      inviteCode: ids.invite,
    }[firstInvalid ?? 'username'];
    if (firstInvalid) window.requestAnimationFrame(() => document.getElementById(target)?.focus());
  }

  const busy = submitting || exiting;

  return (
    <main
      ref={screenRef}
      className={`auth-screen${exiting ? ' auth-exiting' : ''}`}
      inert={exiting}
      aria-hidden={exiting || undefined}
    >
      <div className="auth-shell">
        <AuthBrand />
        <section className="auth-card" aria-label="Account access">
          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button
              type="button"
              role="tab"
              id={`${idPrefix}-tab-sign-in`}
              aria-selected={!creating}
              aria-controls={`${idPrefix}-form`}
              className={!creating ? 'active' : ''}
              onClick={() => switchMode('sign-in')}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              id={`${idPrefix}-tab-create`}
              aria-selected={creating}
              aria-controls={`${idPrefix}-form`}
              aria-disabled={!registrationOpen}
              disabled={!registrationOpen}
              className={creating ? 'active' : ''}
              onClick={() => switchMode('create-account')}
            >
              Create account
            </button>
          </div>

          {!registrationOpen && (
            <p className="auth-note">
              New accounts are closed on this server. Ask whoever runs it for access, then sign in
              here.
            </p>
          )}

          {notice && (
            <p className="auth-note" role="status">
              {notice}
            </p>
          )}

          <form
            id={`${idPrefix}-form`}
            role="tabpanel"
            aria-labelledby={`${idPrefix}-tab-${creating ? 'create' : 'sign-in'}`}
            noValidate
            onSubmit={(event) => void submit(event)}
          >
            {creating && (
              <AuthField
                id={ids.name}
                label="Name"
                error={fieldErrors.displayName}
                help="Your display name for friends to see on your profile."
              >
                <input
                  id={ids.name}
                  name="name"
                  type="text"
                  autoComplete="name"
                  autoCapitalize="words"
                  required
                  placeholder="Sam Sample"
                  value={displayName}
                  aria-invalid={Boolean(fieldErrors.displayName)}
                  aria-describedby={describedBy(ids.name, fieldErrors.displayName)}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </AuthField>
            )}

            <AuthField
              id={ids.username}
              label="Username"
              error={fieldErrors.username}
              help={
                creating
                  ? 'Used to sign in and shown as your handle so friends can find you. Must be unique.'
                  : undefined
              }
            >
              <div className={creating ? 'auth-handle' : undefined}>
                {creating && (
                  <span className="auth-handle-at" aria-hidden="true">
                    @
                  </span>
                )}
                <input
                  id={ids.username}
                  name="username"
                  type="text"
                  inputMode="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  maxLength={32}
                  placeholder={creating ? 'sam.sample' : undefined}
                  value={username}
                  aria-invalid={Boolean(fieldErrors.username)}
                  aria-describedby={describedBy(ids.username, fieldErrors.username)}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
            </AuthField>

            <AuthField
              id={ids.password}
              label="Password"
              error={fieldErrors.password}
              hint={creating ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
            >
              <div className="auth-password">
                <input
                  id={ids.password}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={creating ? 'new-password' : 'current-password'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  minLength={creating ? MIN_PASSWORD_LENGTH : undefined}
                  value={password}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={describedBy(
                    ids.password,
                    fieldErrors.password,
                    creating ? 'hint' : undefined,
                  )}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="auth-reveal"
                  aria-pressed={showPassword}
                  aria-controls={ids.password}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                  <span className="sr-only"> password</span>
                </button>
              </div>
            </AuthField>

            {showInviteCode && (
              <AuthField id={ids.invite} label="Invite code" error={fieldErrors.inviteCode}>
                <input
                  id={ids.invite}
                  name="invite-code"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required={effectiveConfig.invite_code_required}
                  value={inviteCode}
                  aria-invalid={Boolean(fieldErrors.inviteCode)}
                  aria-describedby={describedBy(ids.invite, fieldErrors.inviteCode)}
                  onChange={(event) => setInviteCode(event.target.value)}
                />
              </AuthField>
            )}

            <div className="auth-error-region" aria-live="polite" aria-atomic="true">
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
            </div>

            <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>
              {busy && <Spinner />}
              <span>
                {busy
                  ? creating
                    ? 'Creating account…'
                    : 'Signing in…'
                  : creating
                    ? 'Create account'
                    : 'Sign in'}
              </span>
            </button>

            {creating && (
              <button
                type="button"
                className="auth-sample-profile"
                onClick={() => setSampleOpen(true)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                See a sample profile
              </button>
            )}
          </form>
          {creating && sampleOpen && (
            <SampleProfileDialog
              displayName={displayName}
              username={username}
              onClose={() => setSampleOpen(false)}
            />
          )}
        </section>
      </div>
    </main>
  );
}
