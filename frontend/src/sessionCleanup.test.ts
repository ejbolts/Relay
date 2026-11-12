import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import {
  clearUserDeviceData,
  LAST_USER_KEY,
  readLastUser,
  reconcileSignedInUser,
  signOutAndClear,
  type CleanupStorage,
} from './sessionCleanup';
import { ACTIVE_WORKOUT_DRAFT_KEY } from './workoutDraft';
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
