import { onlineManager, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import type { User } from '../../../frontend/src/types';
import {
  ApiError,
  currentUser,
  retryPendingSignOut,
  signIn as requestSignIn,
  signOut as requestSignOut,
} from '../data/api';
import { forgetSessionToken } from '../data/session';
import { nextSessionEpoch, runBeforeSignOut } from './sessionEpoch';
import { forgetCachedUser, offlineUser, publicUser, rememberUser } from './cachedUser';

type Status =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  /** `offline`: opened from the account cached on this phone, not yet confirmed by the server. */
  | { kind: 'signed-in'; user: User; offline?: boolean }
  | { kind: 'error'; message: string };

interface Session {
  status: Status;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  accountDeleted: () => Promise<void>;
  retry: () => void;
  /** The server's newer copy of the signed-in account, such as after a profile edit. */
  updateUser: (user: User) => void;
}

const SessionContext = createContext<Session | null>(null);

/** The session, or null outside a SessionProvider (as in some screen tests). */
export function useOptionalSession() {
  return useContext(SessionContext);
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession needs a SessionProvider');
  return session;
}

/** The signed-in account. Only screens behind the sign-in gate may call it. */
export function useUser(): User {
  const { status } = useSession();
  if (status.kind !== 'signed-in') throw new Error('useUser needs a signed-in session');
  return status.user;
}

// A refusal of a session that has already ended here (an old account's late request) leaves the
// session signed in now alone.
const signedOutError = (error: unknown) =>
  error instanceof ApiError && error.status === 401 && !error.staleSession;
// A request that never reached the server fails with a plain error; an answer is an ApiError.
const unreachable = (error: unknown) => !(error instanceof ApiError);

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const signedIn = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    signedIn.current = status.kind === 'signed-in';
  }, [status]);

  const endSession = useCallback(() => {
    generation.current += 1;
    nextSessionEpoch();
    signedIn.current = false;
    forgetCachedUser();
    setStatus({ kind: 'signed-out' });
    client.clear();
  }, [client]);

  useEffect(() => {
    const controller = new AbortController();
    currentUser(controller.signal).then(
      (user) => {
        rememberUser(user);
        setStatus({ kind: 'signed-in', user });
      },
      async (error) => {
        if (controller.signal.aborted) return;
        if (signedOutError(error)) {
          forgetCachedUser();
          setStatus({ kind: 'signed-out' });
          return;
        }
        // Offline with this phone's last account and its session still saved: open signed in,
        // so a workout in progress stays reachable. The server confirms it once reachable.
        const user = unreachable(error) ? await offlineUser() : null;
        if (controller.signal.aborted) return;
        if (user) setStatus({ kind: 'signed-in', user, offline: true });
        else
          setStatus({
            kind: 'error',
            message: error instanceof Error ? error.message : '',
          });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  // Confirm the session with the server when the connection returns and when the app comes
  // back to the foreground. Screens stay as they are unless the session has ended.
  const checking = useRef(false);
  const recheck = useCallback(async () => {
    if (!signedIn.current || checking.current) return;
    checking.current = true;
    const startedIn = generation.current;
    try {
      const user = await currentUser(new AbortController().signal);
      if (generation.current !== startedIn) return;
      rememberUser(user);
      setStatus((current) =>
        current.kind === 'signed-in' &&
        !current.offline &&
        JSON.stringify(current.user) === JSON.stringify(user)
          ? current
          : { kind: 'signed-in', user },
      );
    } catch (error) {
      if (signedOutError(error) && generation.current === startedIn && signedIn.current)
        endSession();
    } finally {
      checking.current = false;
    }
  }, [endSession]);

  useEffect(() => {
    // The app feeds onlineManager from NetInfo (src/data/queryClient.ts).
    // Sign-outs the server hasn't confirmed are retried even while signed out, so an earlier
    // account's alerts stop reaching this phone without waiting for the next launch.
    const net = onlineManager.subscribe((online) => {
      if (!online) return;
      void retryPendingSignOut();
      void recheck();
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void retryPendingSignOut();
      void recheck();
    });
    return () => {
      net();
      app?.remove();
    };
  }, [recheck]);

  // A session that ends elsewhere (signed out on the web, password changed) shows up as a 401 on
  // any request: return to the sign-in form and drop the account's cached data.
  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        const error = event.query.state.error;
        if (signedIn.current && signedOutError(error)) endSession();
      }),
    [client, endSession],
  );

  const signIn = useCallback(
    async (username: string, password: string) => {
      const user = publicUser(await requestSignIn(username, password));
      generation.current += 1;
      nextSessionEpoch();
      client.clear();
      rememberUser(user);
      setStatus({ kind: 'signed-in', user });
    },
    [client],
  );
  const signOut = useCallback(async () => {
    await runBeforeSignOut();
    await requestSignOut();
    endSession();
  }, [endSession]);
  const accountDeleted = useCallback(async () => {
    endSession();
    await forgetSessionToken().catch(() => undefined);
  }, [endSession]);
  const retry = useCallback(() => {
    setStatus({ kind: 'loading' });
    setAttempt((value) => value + 1);
  }, []);
  const updateUser = useCallback((user: User) => {
    if (!signedIn.current) return;
    rememberUser(user);
    setStatus({ kind: 'signed-in', user });
  }, []);

  const value = useMemo(
    () => ({ status, signIn, signOut, retry, updateUser, accountDeleted }),
    [status, signIn, signOut, retry, updateUser, accountDeleted],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
