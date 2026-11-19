import { clearActiveWorkoutReminderKey } from './activeWorkoutReminder';
import { ACTIVE_WORKOUT_SYNC_KEY } from './activeWorkoutEvents';
import { draftSignature } from './activeWorkoutSync';
import { api, ApiError } from './api';
import { releasePhonePushSubscription } from './push';
import {
  browserAccountStorage,
  LAST_USER_KEY,
  readLastUser,
  readSignedOutAccount,
  rememberSignedOutAccount,
  rememberUser,
  type AccountStorage,
  type SignedOutAccount,
} from './deviceAccount';
import type { User } from './types';
import {
  clearActiveWorkoutDraft,
  isActiveWorkoutDraft,
  readActiveWorkoutDraft,
} from './workoutDraft';
import { clearWorkoutCache } from './workoutCache';
import { clearBodyMeasurementQueue, reconcileBodyMeasurementQueue } from './bodyMeasurementStore';
import { clearPendingReactions, reconcilePendingReactions } from './pendingReactions';
import {
  clearFinishedWorkouts,
  keepFinishedWorkoutsFor,
  readFinishedWorkouts,
} from './finishedWorkoutQueue';

export {
  LAST_USER_KEY,
  readLastUser,
  readSignedOutAccount,
  rememberUser,
  SIGNED_OUT_ACCOUNT_KEY,
} from './deviceAccount';

export type CleanupStorage = AccountStorage;

export interface CleanupDeps {
  storage: CleanupStorage | null;
  clearCache: () => Promise<void>;
}

export function browserDeps(): CleanupDeps {
  return { storage: browserAccountStorage(), clearCache: clearWorkoutCache };
}

/**
 * The account a session that just ended belonged to: the signed-in account, or one whose
 * session had already ended on this device.
 */
export function endedSessionAccount(storage: CleanupStorage | null): SignedOutAccount | null {
  return readLastUser(storage) ?? readSignedOutAccount(storage);
}

/** True when this device holds a live or finished workout. */
export function hasLocalWorkout(storage: CleanupStorage | null): boolean {
  return readActiveWorkoutDraft(storage) !== null || readFinishedWorkouts(storage).length > 0;
}

/**
 * True when this device holds workout changes the server has not confirmed: a finished workout
 * waiting to save, or a live workout that differs from the last copy the server acknowledged.
 */
export function hasUnsyncedWorkout(
  storage: CleanupStorage | null = browserAccountStorage(),
): boolean {
  if (!storage) return false;
  if (readFinishedWorkouts(storage).length > 0) return true;
  const draft = readActiveWorkoutDraft(storage);
  if (!draft) return false;
  try {
    const saved = JSON.parse(storage.getItem(ACTIVE_WORKOUT_SYNC_KEY) ?? 'null') as {
      base?: { draft?: unknown };
    } | null;
    const acknowledged = saved?.base?.draft;
    return (
      draftSignature(isActiveWorkoutDraft(acknowledged) ? acknowledged : null) !==
      draftSignature(draft)
    );
  } catch {
    return true;
  }
}

/**
 * Removes everything this device stored on behalf of an account: the encrypted offline copy of
 * its data, the unfinished-workout draft, and the active-workout reminder record. Device
 * preferences such as reduced motion and the rest-timer toggle are intentionally kept.
 *
 * When a session merely expires, `keepUnsyncedWorkout` keeps finished workouts and queued body
 * check-ins and reactions that have not reached the server yet, and the live workout with the
 * server copy it was last synced against. They sync after the same account signs in again, and
 * are discarded if a different account signs in.
 */
export async function clearUserDeviceData(
  deps: CleanupDeps = browserDeps(),
  { keepUnsyncedWorkout = false }: { keepUnsyncedWorkout?: boolean } = {},
): Promise<void> {
  const { storage } = deps;
  if (storage) {
    // A live workout is kept only when its account is known, so no other account receives it.
    const owner = keepUnsyncedWorkout ? endedSessionAccount(storage) : null;
    const keepDraft =
      keepUnsyncedWorkout &&
      (owner !== null || Boolean(readActiveWorkoutDraft(storage)?.pendingSave));
    if (!keepUnsyncedWorkout) {
      clearBodyMeasurementQueue(storage);
      clearPendingReactions(storage);
      clearFinishedWorkouts(storage);
    }
    if (!keepDraft) clearActiveWorkoutDraft(storage);
    clearActiveWorkoutReminderKey(storage);
    try {
      storage.removeItem(LAST_USER_KEY);
      if (!keepDraft) storage.removeItem(ACTIVE_WORKOUT_SYNC_KEY);
    } catch {
      // Ignore unavailable storage.
    }
    rememberSignedOutAccount(owner, storage);
  }
  await deps.clearCache();
}

/**
 * Called once a user is confirmed (startup, sign-in, or registration). When the account differs
 * from the one that last used this device, or from the one whose session ended here, the
 * previous account's local data is wiped first. Returns true when a wipe happened.
 */
export async function reconcileSignedInUser(
  user: User,
  deps: CleanupDeps = browserDeps(),
): Promise<boolean> {
  const previous = readLastUser(deps.storage);
  const known = endedSessionAccount(deps.storage);
  let wiped = false;
  if (known && known.id !== user.id) {
    await clearUserDeviceData(deps);
    wiped = true;
  } else if (!previous) {
    // Cached snapshots are refetchable, and may predate accounts, so never trust them blindly.
    await deps.clearCache();
  }
  rememberSignedOutAccount(null, deps.storage);
  rememberUser(user, deps.storage);
  reconcileBodyMeasurementQueue(user.id, deps.storage);
  reconcilePendingReactions(user.id, deps.storage);
  keepFinishedWorkoutsFor(user.id, deps.storage);
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

/** Signs out this device only, or with `everywhere` every device signed in to the account. */
export function browserSignOutDeps({ everywhere = false } = {}): SignOutDeps {
  return {
    ...browserDeps(),
    releasePush: releasePhonePushSubscription,
    logout: everywhere ? api.auth.logout : api.auth.logoutSession,
  };
}

/**
 * Detaches this device's push subscription (best effort, while the session is still valid),
 * ends the session (this device's, or every one the account has), then wipes the local per-user
 * data. A network failure while logging out is thrown and leaves local data untouched, so the
 * user is never told they are signed out while the server session is still alive. An
 * already-expired session counts as signed out.
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
