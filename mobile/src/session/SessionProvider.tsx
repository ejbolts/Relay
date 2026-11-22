import { useQueryClient } from '@tanstack/react-query';
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
import type { User } from '../../../frontend/src/types';
import {
  ApiError,
  currentUser,
  signIn as requestSignIn,
  signOut as requestSignOut,
} from '../data/api';

type Status =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; user: User }
  | { kind: 'error'; message: string };

interface Session {
  status: Status;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
}

const SessionContext = createContext<Session | null>(null);

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

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const signedIn = useRef(false);
  useEffect(() => {
    signedIn.current = status.kind === 'signed-in';
  }, [status]);

  useEffect(() => {
    const controller = new AbortController();
    currentUser(controller.signal).then(
      (user) => setStatus({ kind: 'signed-in', user }),
      (error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) setStatus({ kind: 'signed-out' });
        else setStatus({ kind: 'error', message: error instanceof Error ? error.message : '' });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  // A session that ends elsewhere (signed out on the web, password changed) shows up as a 401 on
  // any request: return to the sign-in form and drop the account's cached data.
  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        const error = event.query.state.error;
        if (signedIn.current && error instanceof ApiError && error.status === 401) {
          setStatus({ kind: 'signed-out' });
          client.clear();
        }
      }),
    [client],
  );

  const signIn = useCallback(
    async (username: string, password: string) => {
      const user = await requestSignIn(username, password);
      client.clear();
      setStatus({ kind: 'signed-in', user });
    },
    [client],
  );
  const signOut = useCallback(async () => {
    await requestSignOut();
    client.clear();
    setStatus({ kind: 'signed-out' });
  }, [client]);
  const retry = useCallback(() => {
    setStatus({ kind: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  const value = useMemo(
    () => ({ status, signIn, signOut, retry }),
    [status, signIn, signOut, retry],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
