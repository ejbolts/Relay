import { ApiError } from './api';
import { isNetworkFailure } from './authForm';
import {
  clearUserDeviceData,
  endedSessionAccount,
  hasLocalWorkout,
  reconcileSignedInUser,
  readLastUser,
  type CleanupDeps,
} from './sessionCleanup';
import type { SignInNotice } from './signInNotice';
import type { User } from './types';

export type AuthState =
  | { status: 'loading' }
  | {
      status: 'signed-out';
      /** Why the sign-in screen is showing, when the person did not sign out here. */
      notice?: SignInNotice;
      /** Starts the sign-in form, after a session ended without signing out here. */
      username?: string;
    }
  | { status: 'authenticated'; user: User; offline: boolean }
  | { status: 'unreachable'; message: string };

/**
 * The session ended without signing out on this device, for example after "Sign out everywhere"
 * on another device or a password change. Drops the account's offline data but keeps its
 * workout for when it signs in again. The storage cleanup is synchronous; `cleaned` settles
 * once the cached snapshots are cleared too.
 */
export function endExpiredSession(deps: CleanupDeps): {
  state: AuthState;
  cleaned: Promise<void>;
} {
  const account = endedSessionAccount(deps.storage);
  const workoutSaved = account !== null && hasLocalWorkout(deps.storage);
  const cleaned = clearUserDeviceData(deps, { keepUnsyncedWorkout: true }).catch(() => undefined);
  return {
    state: account
      ? {
          status: 'signed-out',
          notice: workoutSaved ? 'signed-out-workout-saved' : 'signed-out',
          username: account.username,
        }
      : { status: 'signed-out' },
    cleaned,
  };
}

export interface SessionDeps extends CleanupDeps {
  me: () => Promise<User>;
  isCurrent?: () => boolean;
  offlineStartAfterMs?: number;
}

/** How long startup waits for the server before opening a remembered account offline. */
export const OFFLINE_START_AFTER_MS = 4000;

function answeredWithin<T>(task: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ApiError('The server did not answer in time.')),
      milliseconds,
    );
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason: unknown) => {
        clearTimeout(timer);
        reject(reason);
      },
    );
  });
}

/**
 * Resolves the startup session. A 401 means sign in; a network or server failure must not log
 * anyone out, so a previously seen account keeps the offline-capable app and a first visit gets
 * a retry state instead. A remembered account also opens offline when the server is too slow to
 * answer, for example while a private network connection is down.
 */
export async function resolveSession(deps: SessionDeps): Promise<AuthState> {
  const remembered = readLastUser(deps.storage);
  try {
    const user = await (remembered
      ? answeredWithin(deps.me(), deps.offlineStartAfterMs ?? OFFLINE_START_AFTER_MS)
      : deps.me());
    if (deps.isCurrent && !deps.isCurrent()) return { status: 'loading' };
    await reconcileSignedInUser(user, deps);
    return { status: 'authenticated', user, offline: false };
  } catch (reason) {
    if (deps.isCurrent && !deps.isCurrent()) return { status: 'loading' };
    if (reason instanceof ApiError && reason.status === 401) {
      const { state, cleaned } = endExpiredSession(deps);
      await cleaned;
      return state;
    }
    if (remembered) return { status: 'authenticated', user: remembered, offline: true };
    return {
      status: 'unreachable',
      message: isNetworkFailure(reason)
        ? 'Cannot reach the server. Check your connection and try again.'
        : 'The server is not responding right now. Try again in a moment.',
    };
  }
}

/** Records a user returned by sign-in or registration, wiping another account's local data. */
export async function adoptSignedInUser(user: User, deps: CleanupDeps): Promise<AuthState> {
  await reconcileSignedInUser(user, deps);
  return { status: 'authenticated', user, offline: false };
}
