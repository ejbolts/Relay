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
}

/**
 * Resolves the startup session. A 401 means sign in; a network or server failure must not log
 * anyone out, so a previously seen account keeps the offline-capable app and a first visit gets
 * a retry state instead.
 */
export async function resolveSession(deps: SessionDeps): Promise<AuthState> {
  try {
    const user = await deps.me();
    if (deps.isCurrent && !deps.isCurrent()) return { status: 'loading' };
    await reconcileSignedInUser(user, deps);
    return { status: 'authenticated', user, offline: false };
  } catch (reason) {
    if (deps.isCurrent && !deps.isCurrent()) return { status: 'loading' };
    if (reason instanceof ApiError && reason.status === 401) {
      await clearUserDeviceData(deps).catch(() => undefined);
      return { status: 'signed-out' };
    }
    const cached = readLastUser(deps.storage);
    if (cached) return { status: 'authenticated', user: cached, offline: true };
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
