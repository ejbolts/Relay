// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, revisionAfterSave, SAVED_COPY_AFTER_MS } from './api';
import { isUsingSavedData, reportServerReached } from './connectionStatus';
import { LAST_USER_KEY } from './deviceAccount';
import { clearOffline, replaceOfflineBackend, type OfflineBackend } from './offlineStore';
import { readWorkoutCache, writeWorkoutCache } from './workoutCache';
import { CLIENT_VERSION_HEADER } from './clientVersion';
import type { Exercise, TrackedWorkout } from './types';

class MemoryBackend implements OfflineBackend {
  values = new Map<string, unknown>();
  async get(key: string) {
    return this.values.get(key);
  }
  async put(key: string, value: unknown) {
    this.values.set(key, value);
  }
  async delete(keys: string[]) {
    for (const key of keys) this.values.delete(key);
  }
  async clear() {
    this.values.clear();
  }
}

const bench = { id: 'bench', name: 'Bench press' } as Exercise;
const squat = { id: 'squat', name: 'Back squat' } as Exercise;
const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function signIn(id = 'sample-account') {
  localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id, display_name: 'Sample Lifter' }));
}

async function saveExercisesOnline(exercises: Exercise[]) {
  fetchMock.mockResolvedValueOnce(json(exercises));
  await api.listExercises();
  // The copy is written after the answer is returned.
  await vi.waitFor(async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await api.listExercises()).toEqual(exercises);
  });
  reportServerReached();
  fetchMock.mockReset();
}

beforeEach(() => {
  replaceOfflineBackend(new MemoryBackend());
  localStorage.clear();
  signIn();
  reportServerReached();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('account reads without a connection', () => {
  it('answers from the saved copy when the server cannot be reached, then recovers', async () => {
    await saveExercisesOnline([bench]);

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await api.listExercises()).toEqual([bench]);
    expect(isUsingSavedData()).toBe(true);

    fetchMock.mockImplementation(async () => json([bench, squat]));
    expect(await api.listExercises()).toEqual([bench]);
    await vi.waitFor(() => expect(isUsingSavedData()).toBe(false));
    expect(await api.listExercises()).toEqual([bench, squat]);
  });

  it('treats an unavailable server behind the proxy like no connection', async () => {
    await saveExercisesOnline([bench]);

    fetchMock.mockResolvedValueOnce(json({ error: { message: 'Bad gateway' } }, 502));
    expect(await api.listExercises()).toEqual([bench]);
    expect(isUsingSavedData()).toBe(true);
  });

  it('shows the saved copy after a few seconds when the server does not answer', async () => {
    await saveExercisesOnline([bench]);
    vi.useFakeTimers();
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));

    const read = api.listExercises();
    await vi.advanceTimersByTimeAsync(SAVED_COPY_AFTER_MS);
    expect(await read).toEqual([bench]);

    answer(json([bench, squat]));
    vi.useRealTimers();
    await vi.waitFor(async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      expect(await api.listExercises()).toEqual([bench, squat]);
    });
  });

  it('skips the network wait entirely while the device reports no connection', async () => {
    await saveExercisesOnline([bench]);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    expect(await api.listExercises()).toEqual([bench]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports the real failure when nothing was saved, and never hides server refusals', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.getWorkoutTypes()).rejects.toThrow('Failed to fetch');

    await saveExercisesOnline([bench]);
    fetchMock.mockResolvedValueOnce(
      json({ error: { code: 'not_authenticated', message: 'Sign in again.' } }, 401),
    );
    await expect(api.listExercises()).rejects.toBeInstanceOf(ApiError);
    fetchMock.mockResolvedValueOnce(json({ error: { message: 'Server error' } }, 500));
    await expect(api.listExercises()).rejects.toThrow('Server error');
  });

  it('does not offer one account’s saved copy to the next account on this device', async () => {
    await saveExercisesOnline([bench]);
    signIn('other-account');

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.listExercises()).rejects.toThrow('Failed to fetch');
  });
});

describe('workout history without a connection', () => {
  const recent = { id: 'recent', workout_date: '2026-10-20' } as TrackedWorkout;

  it('cancels a delayed export when the account changes', async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    const pending = api.exportWorkouts();
    const rejected = expect(pending).rejects.toMatchObject({ code: 'account_changed' });
    signIn('different-account');
    resolve(new Response('Sample account A CSV'));
    await rejected;
  });

  it('does not expire the new sign-in when an old request returns 401', async () => {
    const expired = vi.fn();
    window.addEventListener('gym-logger-auth-expired', expired);
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    const pending = api.listExercises();
    const rejected = expect(pending).rejects.toMatchObject({ code: 'account_changed' });
    await clearOffline();
    signIn('different-account');
    resolve(json({ error: { code: 'not_authenticated' } }, 401));
    await rejected;
    expect(expired).not.toHaveBeenCalled();
    window.removeEventListener('gym-logger-auth-expired', expired);
  });

  it.each(['different-account', 'sample-account'])(
    'rejects late history after cleanup and sign-in: %s',
    async (nextAccount) => {
      let resolveSnapshot!: (value: Response) => void;
      fetchMock.mockResolvedValueOnce(json({ revision: 'old-account' })).mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSnapshot = resolve;
          }),
      );
      const pending = api.listWorkouts('2026-08-01');
      const rejected = expect(pending).rejects.toMatchObject({ code: 'account_changed' });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await clearOffline();
      signIn(nextAccount);
      resolveSnapshot(json({ revision: 'old-account', workouts: [recent] }));
      await rejected;
      expect(await readWorkoutCache()).toBeNull();
    },
  );

  it('rejects a late account-specific read after an account switch', async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    const pending = api.listExercises();
    const rejected = expect(pending).rejects.toMatchObject({ code: 'account_changed' });
    signIn('different-account');
    resolve(json([bench]));
    await rejected;
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.listExercises()).rejects.toThrow('Failed to fetch');
  });

  it('uses the saved snapshot when the revision check fails, if it reaches back far enough', async () => {
    await writeWorkoutCache({ revision: 'one', since: '2026-08-01', workouts: [recent] });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await api.listWorkouts('2026-08-01')).toEqual([recent]);
    expect(isUsingSavedData()).toBe(true);
    await expect(api.listWorkouts('2026-01-01')).rejects.toThrow('Failed to fetch');
  });

  it('refreshes the saved snapshot from the server when online', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ revision: 'two' }))
      .mockResolvedValueOnce(json({ revision: 'two', workouts: [recent] }));

    expect(await api.listWorkouts('2026-08-01')).toEqual([recent]);
    expect(await readWorkoutCache()).toEqual({
      revision: 'two',
      since: '2026-08-01',
      workouts: [recent],
    });
  });
});

describe('refreshing straight after a workout save', () => {
  const saved = { id: 'saved-workout', workout_date: '2026-08-02' } as TrackedWorkout;

  it('remembers the revision a save reports and reads the new snapshot without asking again', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(saved), {
        status: 201,
        headers: { 'Content-Type': 'application/json', 'X-Workout-Revision': 'after-save' },
      }),
    );
    const workout = await api.createWorkout({} as Parameters<typeof api.createWorkout>[0]);
    expect(revisionAfterSave(workout)).toBe('after-save');

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(json({ revision: 'after-save', workouts: [saved] }));
    expect(await api.listWorkouts('2026-08-01', 'after-save')).toEqual([saved]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/workouts/snapshot');
  });

  it('reports no revision when the server does not send one', async () => {
    fetchMock.mockResolvedValueOnce(json(saved));
    const workout = await api.updateWorkout(
      saved.id,
      {} as Parameters<typeof api.updateWorkout>[1],
    );
    expect(revisionAfterSave(workout)).toBeNull();
  });
});

describe('workout saves across page closure', () => {
  const saved = { id: 'saved-workout' } as TrackedWorkout;
  const payload = {
    client_session_id: 'a30dfe69-5985-4e0d-8856-01235ebcf670',
    name: 'Upper body',
    notes: '',
  } as Parameters<typeof api.createWorkout>[0];

  it.each(['create', 'update'] as const)(
    'keeps a small %s alive with its body, auth and signal',
    async (method) => {
      fetchMock.mockResolvedValueOnce(json(saved));
      const controller = new AbortController();
      if (method === 'create') await api.createWorkout(payload, controller.signal);
      else await api.updateWorkout(saved.id, payload, controller.signal);

      const [path, init] = fetchMock.mock.calls[0];
      expect(path).toBe(method === 'create' ? '/api/workouts' : `/api/workouts/${saved.id}`);
      expect(init).toMatchObject({
        method: method === 'create' ? 'POST' : 'PUT',
        keepalive: true,
        credentials: 'same-origin',
        signal: controller.signal,
        body: JSON.stringify(payload),
      });
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
      expect(new Headers(init?.headers).get(CLIENT_VERSION_HEADER)).toBeTruthy();
    },
  );

  it('sends a large Unicode workout normally instead of exceeding the keepalive byte limit', async () => {
    const large = { ...payload, notes: '\u{1f4aa}'.repeat(20_000) };
    expect(JSON.stringify(large).length).toBeLessThan(64 * 1024);
    expect(new Blob([JSON.stringify(large)]).size).toBeGreaterThan(64 * 1024);
    fetchMock.mockResolvedValueOnce(json(saved));
    await api.createWorkout(large);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      keepalive: false,
      body: JSON.stringify(large),
    });
  });

  it('falls back when the shared keepalive budget is unavailable, keeping the same session ID', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(saved));
    await api.createWorkout(payload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([, init]) => init?.keepalive)).toEqual([true, false]);
    expect(fetchMock.mock.calls.map(([, init]) => init?.body)).toEqual([
      JSON.stringify(payload),
      JSON.stringify(payload),
    ]);
  });

  it('does not turn a server refusal into a second send', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { message: 'Review workout' } }, 422));
    await expect(api.createWorkout(payload)).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not retry a request explicitly cancelled by the account lifecycle', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(async () => {
      controller.abort();
      throw new TypeError('Failed to fetch');
    });
    await expect(api.createWorkout(payload, controller.signal)).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
