import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { applyUpdateOnSignIn } from './appUpdates';
import { AuthBrand, AuthScreen } from './AuthScreen';
import { subscribeAuthExpired } from './authEvents';
import { reportSavedDataUsed } from './connectionStatus';
import { PasswordChangeRequired } from './PasswordChangeRequired';
import { phonePushPermissionPromptSettled } from './push';
import {
  adoptSignedInUser,
  endExpiredSession,
  resolveSession,
  type AuthState,
} from './authSession';
import {
  browserDeps,
  browserSignOutDeps,
  clearAfterAccountDeletion,
  readLastUser,
  rememberUser,
  restartApp,
  signOutAndClear,
} from './sessionCleanup';
import { holdChangesUntilSessionConfirmed, type SessionHold } from './sessionGate';
import { rememberAccountDeleted, signInNoticeText, takeAccountDeleted } from './signInNotice';
import { TodaySkeleton } from './TodayScreen';
import type { AuthConfig, User } from './types';
import { UserContext, type UserSession } from './userContext';
import { useSessionConnection } from './useSessionConnection';

export function AuthLoading() {
  return (
    <div className="tracker-app">
      <main className="tracker-content">
        <TodaySkeleton />
      </main>
    </div>
  );
}

function AuthUnreachable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="auth-screen">
      <div className="auth-shell">
        <AuthBrand />
        <section className="auth-card" aria-label="Connection problem">
          <h2 className="auth-card-title">Cannot connect</h2>
          <p className="auth-note" role="alert">
            {message}
          </p>
          <button type="button" className="auth-submit" onClick={onRetry}>
            <span>Try again</span>
          </button>
        </section>
      </div>
    </main>
  );
}

export interface AuthGateViewProps {
  state: AuthState;
  authConfig: AuthConfig | null;
  session: UserSession;
  children: ReactNode;
  onAuthenticated: (user: User) => Promise<void>;
  onRetry: () => void;
  /** Just signed in: the sign-in screen animates away above the app, which is already loading. */
  signInExiting?: boolean;
  onSignInExited?: () => void;
}

/** Chooses what to show for an auth state. Kept separate from the effects so it can be tested. */
export function AuthGateView({
  state,
  authConfig,
  session,
  children,
  onAuthenticated,
  onRetry,
  signInExiting = false,
  onSignInExited,
}: AuthGateViewProps) {
  switch (state.status) {
    case 'loading':
      return <AuthLoading />;
    case 'unreachable':
      return <AuthUnreachable message={state.message} onRetry={onRetry} />;
    case 'signed-out':
    case 'authenticated': {
      const signedIn = state.status === 'authenticated';
      // Both states keep the same two slots, so the sign-in screen (and what was typed into it)
      // stays mounted while it animates away above the newly mounted app.
      return (
        <>
          {signedIn && (
            <UserContext.Provider value={session}>
              {/* Keyed by account so a different user always starts from fresh React state. */}
              <Fragment key={state.user.id}>
                {state.user.must_change_password ? <PasswordChangeRequired /> : children}
              </Fragment>
            </UserContext.Provider>
          )}
          {(!signedIn || signInExiting) && (
            <AuthScreen
              config={authConfig}
              onAuthenticated={onAuthenticated}
              notice={
                state.status === 'signed-out' && state.notice
                  ? signInNoticeText(state.notice)
                  : undefined
              }
              initialUsername={state.status === 'signed-out' ? state.username : undefined}
              exiting={signedIn}
              onExited={onSignInExited}
            />
          )}
        </>
      );
    }
  }
}

/**
 * How the gate starts. An account this device remembers opens straight away from what the device
 * saved, and changes are held until the server has confirmed its session. A device with no
 * remembered account waits for the server.
 */
function opening(): { state: AuthState; accountId: string | null; hold: SessionHold | null } {
  const remembered = readLastUser(browserDeps().storage);
  if (!remembered) return { state: { status: 'loading' }, accountId: null, hold: null };
  return {
    state: { status: 'authenticated', user: remembered, offline: false, unconfirmed: true },
    accountId: remembered.id,
    hold: holdChangesUntilSessionConfirmed(),
  };
}

/**
 * Asks the server who is signed in. A device with no remembered account shows nothing of the
 * app until it answers. A remembered account opens at once from this device's saved copies while
 * the server is asked, with every change held until it confirms the same account. A 401 shows
 * the sign-in screen; the app also drops back to it when any later request reports the session
 * has ended.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [opened] = useState(opening);
  const [state, setState] = useState<AuthState>(opened.state);
  const hold = useRef(opened.hold);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cleanup = useRef(Promise.resolve());
  const generation = useRef(0);
  useSessionConnection(state.status === 'authenticated' ? state.user.id : null);

  /** Stops holding changes: they go ahead, or are refused because the session is not this account's. */
  const settleHold = useCallback((outcome: 'confirm' | 'end') => {
    hold.current?.[outcome]();
    hold.current = null;
  }, []);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // A gate that is gone for good must not keep changes held. A development double mount
      // comes straight back, so it is left alone.
      window.setTimeout(() => {
        if (!mounted.current) settleHold('confirm');
      }, 0);
    };
  }, [settleHold]);

  useEffect(() => {
    let cancelled = false;
    const started = generation.current;
    void resolveSession({
      ...browserDeps(),
      me: api.auth.me,
      isCurrent: () => !cancelled && generation.current === started,
    }).then((next) => {
      if (cancelled || generation.current !== started) return;
      if (next.status === 'authenticated' && next.offline) reportSavedDataUsed();
      // Changes held since the account opened go ahead only for that same account. Offline, the
      // app keeps working from this device as it always has.
      settleHold(
        next.status === 'authenticated' && (next.offline || next.user.id === opened.accountId)
          ? 'confirm'
          : 'end',
      );
      // Deleting the account reloads the app at the sign-in screen, which then says so.
      setState(
        next.status === 'signed-out' && takeAccountDeleted()
          ? { status: 'signed-out', notice: 'account-deleted' }
          : next,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, opened.accountId, settleHold]);

  useEffect(
    () =>
      subscribeAuthExpired(() => {
        generation.current += 1;
        settleHold('end');
        // Drop the app's in-memory state and its offline account data together, keeping the
        // workout for when the same account signs in again.
        const { state: next, cleaned } = endExpiredSession(browserDeps());
        setState(next);
        cleanup.current = cleaned;
      }),
    [settleHold],
  );

  const signedOut = state.status === 'signed-out';
  useEffect(() => {
    if (!signedOut) return;
    let cancelled = false;
    void api.auth
      .config()
      .then((config) => {
        if (!cancelled) setAuthConfig(config);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedOut]);

  // Started offline with a remembered account: confirm the session once the connection returns.
  const offline = state.status === 'authenticated' && state.offline;
  useEffect(() => {
    if (!offline) return;
    const confirm = () => setAttempt((current) => current + 1);
    window.addEventListener('online', confirm);
    return () => window.removeEventListener('online', confirm);
  }, [offline]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  // Signing in mounts the app straight away, so its data loads while the sign-in screen exits.
  const [signInExiting, setSignInExiting] = useState(false);
  const onAuthenticated = useCallback(async (user: User) => {
    generation.current += 1;
    await cleanup.current;
    const next = await adoptSignedInUser(user, browserDeps());
    // Someone signed out on an older release moves straight to the newest one, signed in,
    // instead of landing on a refresh prompt.
    if (await applyUpdateOnSignIn({ promptSettled: phonePushPermissionPromptSettled() })) {
      // The page is reloading; keep showing "Signing in…" until it does.
      return new Promise<void>(() => undefined);
    }
    setSignInExiting(true);
    setState(next);
  }, []);
  const onSignInExited = useCallback(() => setSignInExiting(false), []);

  const session = useMemo<UserSession>(
    () => ({
      user: state.status === 'authenticated' ? state.user : null,
      updateUser: (user) => {
        rememberUser(user);
        setState((current) =>
          current.status === 'authenticated' ? { ...current, user } : current,
        );
      },
      signOut: async () => {
        await signOutAndClear(browserSignOutDeps());
        restartApp();
      },
      signOutEverywhere: async () => {
        await signOutAndClear(browserSignOutDeps({ everywhere: true }));
        restartApp();
      },
      accountDeleted: async () => {
        await clearAfterAccountDeletion();
        rememberAccountDeleted();
        restartApp();
      },
      signingIn: signInExiting,
    }),
    [signInExiting, state],
  );

  return (
    <AuthGateView
      state={state}
      authConfig={authConfig}
      session={session}
      onAuthenticated={onAuthenticated}
      onRetry={retry}
      signInExiting={signInExiting}
      onSignInExited={onSignInExited}
    >
      {children}
    </AuthGateView>
  );
}
