import { clearActiveWorkoutReminderKey } from './activeWorkoutReminder';
import { api, ApiError } from './api';
import { releasePhonePushSubscription } from './push';
import {
  browserAccountStorage,
  LAST_USER_KEY,
  readLastUser,
  rememberUser,
  type AccountStorage,
} from './deviceAccount';
import type { User } from './types';
import { clearActiveWorkoutDraft, readActiveWorkoutDraft } from './workoutDraft';
import { clearWorkoutCache } from './workoutCache';

export { LAST_USER_KEY, readLastUser, rememberUser } from './deviceAccount';

export type CleanupStorage = AccountStorage;

export interface CleanupDeps {
  storage: CleanupStorage | null;
  clearCache: () => Promise<void>;
}

export function browserDeps(): CleanupDeps {
  return { storage: browserAccountStorage(), clearCache: clearWorkoutCache };
}

/**
 * Removes everything this device stored on behalf of an account: the encrypted offline copy of
 * its data, the unfinished-workout draft, and the active-workout reminder record. Device
 * preferences such as reduced motion and the rest-timer toggle are intentionally kept.
 *
 * When a session merely expires, `keepUnsyncedWorkout` keeps a finished workout that has not
 * reached the server yet, so it syncs after the same account signs in again. It stays tied to
 * that account and is discarded if a different account signs in.
 */
export async function clearUserDeviceData(
  deps: CleanupDeps = browserDeps(),
  { keepUnsyncedWorkout = false }: { keepUnsyncedWorkout?: boolean } = {},
): Promise<void> {
  const { storage } = deps;
  if (storage) {
    if (!keepUnsyncedWorkout || !readActiveWorkoutDraft(storage)?.pendingSave)
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
