// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, SAVED_COPY_AFTER_MS } from './api';
import { isUsingSavedData, reportServerReached } from './connectionStatus';
import { LAST_USER_KEY } from './deviceAccount';
import { replaceOfflineBackend, type OfflineBackend } from './offlineStore';
import { readWorkoutCache, writeWorkoutCache } from './workoutCache';
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
