import { ApiError } from './api';
import { isNetworkFailure } from './authForm';
import {
  clearUserDeviceData,
  reconcileSignedInUser,
  readLastUser,
  type CleanupDeps,
} from './sessionCleanup';
import type { User } from './types';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'authenticated'; user: User; offline: boolean }
  | { status: 'unreachable'; message: string };

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
      await clearUserDeviceData(deps, { keepUnsyncedWorkout: true }).catch(() => undefined);
      return { status: 'signed-out' };
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
