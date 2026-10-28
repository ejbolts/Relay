import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { AuthBrand, AuthScreen } from './AuthScreen';
import { subscribeAuthExpired } from './authEvents';
import { adoptSignedInUser, resolveSession, type AuthState } from './authSession';
import {
  browserDeps,
  clearAfterAccountDeletion,
  clearUserDeviceData,
  rememberUser,
  restartApp,
  signOutAndClear,
} from './sessionCleanup';
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
              <Fragment key={state.user.id}>{children}</Fragment>
            </UserContext.Provider>
          )}
          {(!signedIn || signInExiting) && (
            <AuthScreen
              config={authConfig}
              onAuthenticated={onAuthenticated}
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
 * Asks the server who is signed in before the app mounts, so none of the app's data loading
 * starts without a session. A 401 shows the sign-in screen; the app also drops back to it when
 * any later request reports the session has ended.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cleanup = useRef(Promise.resolve());
  const generation = useRef(0);
  useSessionConnection(state.status === 'authenticated' ? state.user.id : null);

  useEffect(() => {
    let cancelled = false;
    const started = generation.current;
    void resolveSession({
      ...browserDeps(),
      me: api.auth.me,
      isCurrent: () => !cancelled && generation.current === started,
    }).then((next) => {
      if (!cancelled && generation.current === started) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(
    () =>
      subscribeAuthExpired(() => {
        generation.current += 1;
        // Drop the app's in-memory state and its offline account data together.
        setState({ status: 'signed-out' });
        cleanup.current = clearUserDeviceData().catch(() => undefined);
      }),
    [],
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
        await signOutAndClear();
        restartApp();
      },
      accountDeleted: async () => {
        await clearAfterAccountDeletion();
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
