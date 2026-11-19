import { describe, expect, it, vi } from 'vitest';
import { ACTIVE_WORKOUT_SYNC_KEY } from './activeWorkoutEvents';
import { api, ApiError } from './api';
import {
  browserSignOutDeps,
  clearUserDeviceData,
  hasUnsyncedWorkout,
  LAST_USER_KEY,
  readLastUser,
  readSignedOutAccount,
  reconcileSignedInUser,
  signOutAndClear,
  type CleanupStorage,
} from './sessionCleanup';
import {
  ACTIVE_WORKOUT_DRAFT_KEY,
  readActiveWorkoutDraft,
  writeActiveWorkoutDraft,
  type ActiveWorkoutDraft,
} from './workoutDraft';
import { FINISHED_WORKOUTS_KEY } from './finishedWorkoutQueue';
import type { User } from './types';

class MemoryStorage implements CleanupStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const REMINDER_KEY = 'gym-video-logger.active-workout-reminder';

function user(id: string): User {
  return {
    id,
    username: `${id}`,
    display_name: id,
    is_admin: false,
    can_upload_videos: true,
    created_at: '2026-10-01T10:00:00Z',
  };
}

function populated() {
  const storage = new MemoryStorage();
  storage.setItem(ACTIVE_WORKOUT_DRAFT_KEY, '{"draft":true}');
  storage.setItem(REMINDER_KEY, '{"endpoint":"e","timer_id":"1"}');
  storage.setItem('gym-logger-reduce-motion', 'reduced');
  storage.setItem('gym-logger-rest-timer', 'disabled');
  return storage;
}

describe('clearUserDeviceData', () => {
  it('removes the draft, reminder record, remembered user, and cached snapshots', async () => {
    const storage = populated();
    storage.setItem(LAST_USER_KEY, JSON.stringify(user('a')));
    const clearCache = vi.fn().mockResolvedValue(undefined);

    await clearUserDeviceData({ storage, clearCache });

    expect(storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).toBeNull();
    expect(storage.getItem(REMINDER_KEY)).toBeNull();
    expect(storage.getItem(LAST_USER_KEY)).toBeNull();
    expect(clearCache).toHaveBeenCalledOnce();
  });

  it('keeps device-only preferences', async () => {
    const storage = populated();

    await clearUserDeviceData({ storage, clearCache: vi.fn().mockResolvedValue(undefined) });

    expect(storage.getItem('gym-logger-reduce-motion')).toBe('reduced');
    expect(storage.getItem('gym-logger-rest-timer')).toBe('disabled');
  });
});

describe('finished workouts waiting to sync', () => {
  const queued = '{"version":1,"items":[]}';

  it('are removed on sign-out but kept when a session merely expires', async () => {
    const clearCache = vi.fn().mockResolvedValue(undefined);
    const signedOut = populated();
    signedOut.setItem(FINISHED_WORKOUTS_KEY, queued);
    await clearUserDeviceData({ storage: signedOut, clearCache });
    expect(signedOut.getItem(FINISHED_WORKOUTS_KEY)).toBeNull();

    const expired = populated();
    expired.setItem(FINISHED_WORKOUTS_KEY, queued);
    await clearUserDeviceData({ storage: expired, clearCache }, { keepUnsyncedWorkout: true });
    expect(expired.getItem(FINISHED_WORKOUTS_KEY)).toBe(queued);
  });

  it('never pass to a different account signing in on this device', async () => {
    const storage = populated();
    storage.setItem(LAST_USER_KEY, JSON.stringify(user('a')));
    storage.setItem(FINISHED_WORKOUTS_KEY, queued);
    await reconcileSignedInUser(user('b'), {
      storage,
      clearCache: vi.fn().mockResolvedValue(undefined),
    });
    expect(storage.getItem(FINISHED_WORKOUTS_KEY)).toBeNull();
  });
});

describe('reconcileSignedInUser', () => {
  it('wipes the previous account data when a different user signs in', async () => {
    const storage = populated();
    storage.setItem(LAST_USER_KEY, JSON.stringify(user('a')));
    const clearCache = vi.fn().mockResolvedValue(undefined);

    const wiped = await reconcileSignedInUser(user('b'), { storage, clearCache });

    expect(wiped).toBe(true);
    expect(storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).toBeNull();
    expect(readLastUser(storage)?.id).toBe('b');
  });

  it('keeps an unfinished workout when the same account signs back in', async () => {
    const storage = populated();
    storage.setItem(LAST_USER_KEY, JSON.stringify(user('a')));
    const clearCache = vi.fn().mockResolvedValue(undefined);

    const wiped = await reconcileSignedInUser(user('a'), { storage, clearCache });

    expect(wiped).toBe(false);
    expect(storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).toBe('{"draft":true}');
    expect(clearCache).not.toHaveBeenCalled();
  });

  it('drops refetchable caches the first time an account is remembered', async () => {
    const storage = populated();
    const clearCache = vi.fn().mockResolvedValue(undefined);

    await reconcileSignedInUser(user('a'), { storage, clearCache });

    expect(clearCache).toHaveBeenCalledOnce();
    expect(storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).toBe('{"draft":true}');
    expect(readLastUser(storage)?.id).toBe('a');
  });
});

function liveWorkout(overrides: Partial<ActiveWorkoutDraft> = {}): ActiveWorkoutDraft {
  const startedAt = Date.now() - 20 * 60_000;
  return {
    version: 1,
    clientSessionId: '0d6c1f5e-3c35-4bb0-9d55-2f1c8d7a8e11',
    startedAt,
    updatedAt: startedAt,
    name: 'Sample upper session',
    workoutDate: '2026-11-19',
    category: 'upper',
    notes: '',
    movements: [],
    ...overrides,
  };
}

describe('a live workout when the session ends on another device', () => {
  const clearCache = () => Promise.resolve();

  it('is kept with its sync record and its account for the same account to sign in again', async () => {
    const storage = new MemoryStorage();
    storage.setItem(LAST_USER_KEY, JSON.stringify(user('a')));
    writeActiveWorkoutDraft(liveWorkout(), storage);
    storage.setItem(ACTIVE_WORKOUT_SYNC_KEY, '{"userId":"a","base":{"revision":3,"draft":null}}');

    await clearUserDeviceData({ storage, clearCache }, { keepUnsyncedWorkout: true });

    expect(readActiveWorkoutDraft(storage)?.name).toBe('Sample upper session');
    expect(storage.getItem(ACTIVE_WORKOUT_SYNC_KEY)).not.toBeNull();
    expect(readLastUser(storage)).toBeNull();
    expect(readSignedOutAccount(storage)).toEqual({ id: 'a', username: 'a' });

    expect(await reconcileSignedInUser(user('a'), { storage, clearCache })).toBe(false);
    expect(readActiveWorkoutDraft(storage)?.name).toBe('Sample upper session');
    expect(storage.getItem(ACTIVE_WORKOUT_SYNC_KEY)).not.toBeNull();
    expect(readSignedOutAccount(storage)).toBeNull();
  });

  it('is discarded when a different account signs in', async () => {
    const storage = new MemoryStorage();
    storage.setItem(LAST_USER_KEY, JSON.stringify(user('a')));
    writeActiveWorkoutDraft(liveWorkout(), storage);
    storage.setItem(ACTIVE_WORKOUT_SYNC_KEY, '{"userId":"a","base":{"revision":3,"draft":null}}');
    await clearUserDeviceData({ storage, clearCache }, { keepUnsyncedWorkout: true });

    expect(await reconcileSignedInUser(user('b'), { storage, clearCache })).toBe(true);

    expect(storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).toBeNull();
    expect(storage.getItem(ACTIVE_WORKOUT_SYNC_KEY)).toBeNull();
    expect(readSignedOutAccount(storage)).toBeNull();
  });

  it('is dropped when no account is known to own it', async () => {
    const storage = new MemoryStorage();
    writeActiveWorkoutDraft(liveWorkout(), storage);

    await clearUserDeviceData({ storage, clearCache }, { keepUnsyncedWorkout: true });

    expect(storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).toBeNull();
  });

  it('is cleared, with the account, by signing out on this device', async () => {
    const storage = new MemoryStorage();
    storage.setItem(LAST_USER_KEY, JSON.stringify(user('a')));
    writeActiveWorkoutDraft(liveWorkout(), storage);
    await clearUserDeviceData({ storage, clearCache }, { keepUnsyncedWorkout: true });

    await clearUserDeviceData({ storage, clearCache });

    expect(storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).toBeNull();
    expect(readSignedOutAccount(storage)).toBeNull();
  });
});

describe('hasUnsyncedWorkout', () => {
  it('is false with no workout, or one the server has acknowledged', () => {
    const storage = new MemoryStorage();
    expect(hasUnsyncedWorkout(storage)).toBe(false);

    const draft = liveWorkout();
    writeActiveWorkoutDraft(draft, storage);
    storage.setItem(
      ACTIVE_WORKOUT_SYNC_KEY,
      JSON.stringify({ userId: 'a', base: { revision: 2, draft: { ...draft, updatedAt: 1 } } }),
    );
    expect(hasUnsyncedWorkout(storage)).toBe(false);
  });

  it('is true for edits the server has not seen, or a finished workout waiting to save', () => {
    const storage = new MemoryStorage();
    writeActiveWorkoutDraft(liveWorkout({ notes: 'Logged offline' }), storage);
    storage.setItem(
      ACTIVE_WORKOUT_SYNC_KEY,
      JSON.stringify({ userId: 'a', base: { revision: 2, draft: liveWorkout() } }),
    );
    expect(hasUnsyncedWorkout(storage)).toBe(true);

    storage.removeItem(ACTIVE_WORKOUT_SYNC_KEY);
    expect(hasUnsyncedWorkout(storage)).toBe(true);

    const queued = new MemoryStorage();
    writeActiveWorkoutDraft(
      liveWorkout({
        pendingSave: {
          userId: 'a',
          finishedAt: Date.now(),
          workoutId: null,
          payload: {
            client_session_id: '0d6c1f5e-3c35-4bb0-9d55-2f1c8d7a8e11',
            name: 'Sample upper session',
            workout_date: '2026-11-19',
            category: 'upper',
            notes: null,
            duration_minutes: 20,
            start_time: null,
            end_time: null,
            movements: [
              {
                exercise_id: 'bench',
                notes: null,
                machine_photo_ids: [],
                sets: [{ reps: 8, weight_kg: 60, completed: true } as never],
              },
            ],
          },
        },
      }),
      queued,
    );
    expect(hasUnsyncedWorkout(queued)).toBe(true);
  });
});

describe('browserSignOutDeps', () => {
  it('signs out this device by default, and every device when asked', () => {
    expect(browserSignOutDeps().logout).toBe(api.auth.logoutSession);
    expect(browserSignOutDeps({ everywhere: true }).logout).toBe(api.auth.logout);
  });
});

describe('signOutAndClear', () => {
  it('releases push, logs out, then clears local data in that order', async () => {
    const storage = populated();
    const order: string[] = [];
    await signOutAndClear({
      storage,
      clearCache: async () => void order.push('cache'),
      releasePush: async () => void order.push('push'),
      logout: async () => void order.push('logout'),
    });

    expect(order).toEqual(['push', 'logout', 'cache']);
    expect(storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).toBeNull();
    expect(storage.getItem(REMINDER_KEY)).toBeNull();
  });

  it('still signs out when the push cleanup fails', async () => {
    const storage = populated();
    const logout = vi.fn().mockResolvedValue(undefined);

    await signOutAndClear({
      storage,
      clearCache: vi.fn().mockResolvedValue(undefined),
      releasePush: () => Promise.reject(new Error('push service down')),
      logout,
    });

    expect(logout).toHaveBeenCalledOnce();
    expect(storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).toBeNull();
  });

  it('keeps local data and reports the error when the server cannot be reached', async () => {
    const storage = populated();
    const clearCache = vi.fn().mockResolvedValue(undefined);

    await expect(
      signOutAndClear({
        storage,
        clearCache,
        releasePush: vi.fn().mockResolvedValue(undefined),
        logout: () => Promise.reject(new TypeError('Failed to fetch')),
      }),
    ).rejects.toThrow('Failed to fetch');

    expect(storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).not.toBeNull();
    expect(clearCache).not.toHaveBeenCalled();
  });

  it('treats an already-expired session as signed out', async () => {
    const storage = populated();

    await signOutAndClear({
      storage,
      clearCache: vi.fn().mockResolvedValue(undefined),
      releasePush: vi.fn().mockResolvedValue(undefined),
      logout: () => Promise.reject(new ApiError('expired', 'not_authenticated', 401)),
    });

    expect(storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).toBeNull();
  });
});
