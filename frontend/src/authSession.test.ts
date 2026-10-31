import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { resolveSession } from './authSession';
import { LAST_USER_KEY, type CleanupStorage } from './sessionCleanup';
import type { User } from './types';
import {
  ACTIVE_WORKOUT_DRAFT_KEY,
  readActiveWorkoutDraft,
  writeActiveWorkoutDraft,
  type ActiveWorkoutDraft,
} from './workoutDraft';

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

const user: User = {
  id: 'user-1',
  username: 'lifter',
  display_name: 'Lifter',
  is_admin: false,
  can_upload_videos: true,
  created_at: '2026-10-01T10:00:00Z',
};

function deps(me: () => Promise<User>, storage = new MemoryStorage()) {
  return { me, storage, clearCache: vi.fn().mockResolvedValue(undefined) };
}

/** A finished sample workout stored on the device but not yet accepted by the server. */
function finishedOffline(): ActiveWorkoutDraft {
  const startedAt = Date.now() - 45 * 60_000;
  const clientSessionId = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
  return {
    version: 1,
    clientSessionId,
    startedAt,
    updatedAt: startedAt,
    name: 'Sample push session',
    workoutDate: '2026-10-30',
    category: 'push',
    notes: '',
    movements: [],
    pendingSave: {
      userId: user.id,
      finishedAt: Date.now(),
      workoutId: null,
      payload: {
        client_session_id: clientSessionId,
        name: 'Sample push session',
        workout_date: '2026-10-30',
        category: 'push',
        notes: null,
        duration_minutes: 45,
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
  };
}

describe('resolveSession', () => {
  it('does not restore account data from a response superseded by sign-out', async () => {
    const session = deps(() => Promise.resolve(user));
    await resolveSession({ ...session, isCurrent: () => false });
    expect(session.storage.getItem(LAST_USER_KEY)).toBeNull();
    expect(session.clearCache).not.toHaveBeenCalled();
  });

  it('authenticates when the server returns the user and remembers them', async () => {
    const session = deps(() => Promise.resolve(user));

    const state = await resolveSession(session);

    expect(state).toEqual({ status: 'authenticated', user, offline: false });
    expect(JSON.parse(session.storage.getItem(LAST_USER_KEY) ?? 'null')).toEqual(user);
  });

  it('shows the sign-in screen on 401', async () => {
    const state = await resolveSession(
      deps(() => Promise.reject(new ApiError('Sign in', 'not_authenticated', 401))),
    );

    expect(state).toEqual({ status: 'signed-out' });
  });

  it('removes remembered account data after confirmed revocation, including at startup', async () => {
    const storage = new MemoryStorage();
    storage.setItem(LAST_USER_KEY, JSON.stringify(user));
    storage.setItem(ACTIVE_WORKOUT_DRAFT_KEY, 'sample draft');
    const session = deps(
      () => Promise.reject(new ApiError('Sign in', 'not_authenticated', 401)),
      storage,
    );
    expect(await resolveSession(session)).toEqual({ status: 'signed-out' });
    expect(storage.getItem(LAST_USER_KEY)).toBeNull();
    expect(storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).toBeNull();
    expect(session.clearCache).toHaveBeenCalledOnce();
  });

  it('keeps a finished workout that has not synced when the session expires', async () => {
    const storage = new MemoryStorage();
    storage.setItem(LAST_USER_KEY, JSON.stringify(user));
    expect(writeActiveWorkoutDraft(finishedOffline(), storage)).toBe(true);
    const session = deps(
      () => Promise.reject(new ApiError('Sign in', 'not_authenticated', 401)),
      storage,
    );

    expect(await resolveSession(session)).toEqual({ status: 'signed-out' });
    expect(readActiveWorkoutDraft(storage)?.pendingSave?.payload.duration_minutes).toBe(45);
    expect(storage.getItem(LAST_USER_KEY)).toBeNull();
    expect(session.clearCache).toHaveBeenCalledOnce();
  });

  it('opens a remembered account offline when the server does not answer in time', async () => {
    const storage = new MemoryStorage();
    storage.setItem(LAST_USER_KEY, JSON.stringify(user));

    const state = await resolveSession({
      ...deps(() => new Promise<User>(() => {}), storage),
      offlineStartAfterMs: 10,
    });

    expect(state).toEqual({ status: 'authenticated', user, offline: true });
  });

  it('waits for a slow server on a first visit, with no account to open offline', async () => {
    const slowly = () => new Promise<User>((resolve) => setTimeout(() => resolve(user), 30));

    const state = await resolveSession({ ...deps(slowly), offlineStartAfterMs: 10 });

    expect(state).toEqual({ status: 'authenticated', user, offline: false });
  });

  it('keeps a remembered user in the offline app instead of signing them out', async () => {
    const storage = new MemoryStorage();
    storage.setItem(LAST_USER_KEY, JSON.stringify(user));

    const state = await resolveSession(
      deps(() => Promise.reject(new TypeError('Failed to fetch')), storage),
    );

    expect(state).toEqual({ status: 'authenticated', user, offline: true });
  });

  it('offers a retry when offline on a first visit', async () => {
    const state = await resolveSession(deps(() => Promise.reject(new TypeError('offline'))));

    expect(state).toMatchObject({ status: 'unreachable' });
  });

  it('wipes local data when a different account is signed in', async () => {
    const storage = new MemoryStorage();
    storage.setItem(LAST_USER_KEY, JSON.stringify({ ...user, id: 'someone-else' }));
    const session = deps(() => Promise.resolve(user), storage);

    await resolveSession(session);

    expect(session.clearCache).toHaveBeenCalledOnce();
    expect(JSON.parse(storage.getItem(LAST_USER_KEY) ?? 'null').id).toBe('user-1');
  });
});
