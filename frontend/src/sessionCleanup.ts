import { clearActiveWorkoutReminderKey } from './activeWorkoutReminder';
import { api, ApiError } from './api';
import { releasePhonePushSubscription } from './push';
import type { User } from './types';
import { clearActiveWorkoutDraft } from './workoutDraft';
import { clearWorkoutCache } from './workoutCache';

/** Remembers which account last used this device so a different account never sees its data. */
export const LAST_USER_KEY = 'gym-logger-last-user';

export interface CleanupStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CleanupDeps {
  storage: CleanupStorage | null;
  clearCache: () => Promise<void>;
}

export function browserDeps(): CleanupDeps {
  let storage: CleanupStorage | null = null;
  try {
    storage = typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    storage = null;
  }
  return { storage, clearCache: clearWorkoutCache };
}

/** The account that last signed in on this device, kept so the app can start while offline. */
export function readLastUser(storage: CleanupStorage | null = browserDeps().storage): User | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(LAST_USER_KEY) ?? 'null') as Partial<User> | null;
    return parsed && typeof parsed.id === 'string' && typeof parsed.display_name === 'string'
      ? (parsed as User)
      : null;
  } catch {
    return null;
  }
}

export function rememberUser(user: User, storage: CleanupStorage | null = browserDeps().storage) {
  try {
    storage?.setItem(LAST_USER_KEY, JSON.stringify(user));
  } catch {
    // Storage can be unavailable or full; the cleanup check just runs again next time.
  }
}

/**
 * Removes everything this device stored on behalf of an account: the IndexedDB workout and
 * dashboard cache, the unfinished-workout draft, and the active-workout reminder record. Device
 * preferences such as reduced motion and the rest-timer toggle are intentionally kept.
 */
export async function clearUserDeviceData(deps: CleanupDeps = browserDeps()): Promise<void> {
  const { storage } = deps;
  if (storage) {
    clearActiveWorkoutDraft(storage);
    clearActiveWorkoutReminderKey(storage);
    try {
      storage.removeItem(LAST_USER_KEY);
    } catch {
      // Ignore unavailable storage.
    }
  }
  await deps.clearCache();
}

/**
 * Called once a user is confirmed (startup, sign-in, or registration). When the account differs
 * from the one that last used this device, the previous account's local data is wiped first.
 * Returns true when a wipe happened.
 */
export async function reconcileSignedInUser(
  user: User,
  deps: CleanupDeps = browserDeps(),
): Promise<boolean> {
  const previous = readLastUser(deps.storage);
  let wiped = false;
  if (previous && previous.id !== user.id) {
    await clearUserDeviceData(deps);
    wiped = true;
  } else if (!previous) {
    // Cached snapshots are refetchable, and may predate accounts, so never trust them blindly.
    await deps.clearCache();
  }
  rememberUser(user, deps.storage);
  return wiped;
}

function withTimeout(task: Promise<unknown>, milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    task.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

export interface SignOutDeps extends CleanupDeps {
  releasePush: () => Promise<void>;
  logout: () => Promise<void>;
}

function browserSignOutDeps(): SignOutDeps {
  return {
    ...browserDeps(),
    releasePush: releasePhonePushSubscription,
    logout: api.auth.logout,
  };
}

/**
 * Detaches this device's push subscription (best effort, while the session is still valid),
 * ends all account sessions, then wipes the local per-user data. A network failure while logging
 * out is thrown and leaves local data untouched, so the user is never told they are signed out
 * while the server session is still alive. An already-expired session counts as signed out.
 */
export async function signOutAndClear(deps: SignOutDeps = browserSignOutDeps()): Promise<void> {
  await withTimeout(deps.releasePush(), 4000);
  try {
    await deps.logout();
  } catch (reason) {
    if (!(reason instanceof ApiError && reason.status === 401)) throw reason;
  }
  await clearUserDeviceData(deps);
}

/** Starts the app over from the sign-in screen with no in-memory state from the old account. */
export function restartApp(): void {
  window.history.replaceState(null, '', window.location.pathname);
  window.location.reload();
}

/** After the server deleted the account: drop the browser push subscription and local data. */
export async function clearAfterAccountDeletion(
  deps: Pick<SignOutDeps, 'releasePush' | 'storage' | 'clearCache'> = browserSignOutDeps(),
): Promise<void> {
  await withTimeout(deps.releasePush(), 4000);
  await clearUserDeviceData(deps);
}
