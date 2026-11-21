// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, revisionAtSignIn } from './api';
import { reportServerReached } from './connectionStatus';
import { LAST_USER_KEY } from './deviceAccount';
import { replaceOfflineBackend, writeOffline, type OfflineBackend } from './offlineStore';
import type { BodyMeasurement, Exercise, PersonalRecord, TrackedWorkout, User } from './types';

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

const SINCE = '2026-08-01';
const TODAY = '2026-11-20';
const account = { id: 'sample-account', username: 'sample', display_name: 'Sample Lifter' } as User;
const bench = { id: 'bench', name: 'Bench press' } as Exercise;
const record = { id: 'record-1', exercise_id: 'bench' } as PersonalRecord;
const workout = { id: 'workout-1', workout_date: '2026-11-18' } as TrackedWorkout;
const olderWorkout = { id: 'workout-0', workout_date: '2026-06-02' } as TrackedWorkout;
const checkIn = {
  id: 'check-in-1',
  measurement_date: '2026-11-19',
  weight_kg: 80,
} as BodyMeasurement;
const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function signIn(id = account.id) {
  localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id, display_name: 'Sample Lifter' }));
}

/** Reads everything the app opens with from the server, which saves a copy of each answer. */
async function readOpeningData(revision: string) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url === '/api/exercises') return json([bench]);
    if (url.startsWith('/api/personal-records')) return json([record]);
    if (url.startsWith('/api/workouts/snapshot'))
      return json({ revision, workouts: [workout, olderWorkout] });
    if (url === '/api/body-measurements') return json([checkIn]);
    throw new TypeError(`Unexpected request: ${url}`);
  });
  await Promise.all([
    api.listExercises(),
    api.listPersonalRecords(),
    api.listWorkouts(SINCE, revision),
    api.listBodyMeasurements(),
  ]);
  await api.rememberStartupData(revision, TODAY);
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the revision reported with a sign-in', () => {
  it('comes with the session check and with signing in', async () => {
    fetchMock.mockResolvedValueOnce(json(account, 200, { 'X-Workout-Revision': 'rev-7' }));
    expect(revisionAtSignIn(await api.auth.me())).toBe('rev-7');

    fetchMock.mockResolvedValueOnce(json(account, 200, { 'X-Workout-Revision': 'rev-8' }));
    const user = await api.auth.login({ username: 'sample', password: 'sample-password' });
    expect(revisionAtSignIn(user)).toBe('rev-8');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/login');
  });

  it('is unknown for an older server, and for an account object the server did not return', async () => {
    fetchMock.mockResolvedValueOnce(json(account));
    expect(revisionAtSignIn(await api.auth.me())).toBeNull();
    expect(revisionAtSignIn({ ...account })).toBeNull();
  });
});

describe('opening with the copies saved on this device', () => {
  it('has nothing to open with before the opening data has been read', async () => {
    expect(await api.savedStartupData('rev-1', SINCE)).toBeNull();
    // A revision alone is not enough: the copies themselves must be there.
    await api.rememberStartupData('rev-1', TODAY);
    expect(await api.savedStartupData('rev-1', SINCE)).toBeNull();
  });

  it('returns every copy once they were all saved at the revision the server reports', async () => {
    await readOpeningData('rev-1');
    await vi.waitFor(async () =>
      expect(await api.savedStartupData('rev-1', SINCE)).toEqual({
        exercises: [bench],
        // Only the workouts the app opens with, not the older ones the copy also holds.
        workouts: [workout],
        personalRecords: [record],
        measurements: [expect.objectContaining({ measurement_date: '2026-11-19', weight_kg: 80 })],
        // The day the dashboard was read for, so the app knows whether it is still current.
        dashboardDate: TODAY,
      }),
    );
    // Reading the copies never asks the server.
    const requests = fetchMock.mock.calls.length;
    await api.savedStartupData('rev-1', SINCE);
    expect(fetchMock).toHaveBeenCalledTimes(requests);
  });

  it('refuses copies saved at another revision', async () => {
    await readOpeningData('rev-1');
    await vi.waitFor(async () => expect(await api.savedStartupData('rev-1', SINCE)).not.toBeNull());
    expect(await api.savedStartupData('rev-2', SINCE)).toBeNull();
    // The server moved on and only the stamp caught up: the workouts copy is still older.
    await api.rememberStartupData('rev-2', TODAY);
    expect(await api.savedStartupData('rev-2', SINCE)).toBeNull();
  });

  it('refuses copies that do not reach back as far as the app opens with', async () => {
    await readOpeningData('rev-1');
    await vi.waitFor(async () => expect(await api.savedStartupData('rev-1', SINCE)).not.toBeNull());
    expect(await api.savedStartupData('rev-1', '2026-05-01')).toBeNull();
  });

  it('refuses copies saved by another release', async () => {
    await readOpeningData('rev-1');
    await vi.waitFor(async () => expect(await api.savedStartupData('rev-1', SINCE)).not.toBeNull());
    await writeOffline('startup-data-v1', { revision: 'rev-1', version: '0.0.1' }, account.id);
    expect(await api.savedStartupData('rev-1', SINCE)).toBeNull();
  });

  it('does not vouch for the dashboard when the day it was read for is unknown', async () => {
    await readOpeningData('rev-1');
    await vi.waitFor(async () => expect(await api.savedStartupData('rev-1', SINCE)).not.toBeNull());
    const { CLIENT_VERSION } = await import('./clientVersion');
    await writeOffline(
      'startup-data-v1',
      { revision: 'rev-1', version: CLIENT_VERSION },
      account.id,
    );
    expect((await api.savedStartupData('rev-1', SINCE))?.dashboardDate).toBeNull();
  });

  it('never opens one account with another account’s copies', async () => {
    await readOpeningData('rev-1');
    await vi.waitFor(async () => expect(await api.savedStartupData('rev-1', SINCE)).not.toBeNull());
    signIn('another-account');
    expect(await api.savedStartupData('rev-1', SINCE)).toBeNull();
    localStorage.clear();
    expect(await api.savedStartupData('rev-1', SINCE)).toBeNull();
    await expect(api.rememberStartupData('rev-1', TODAY)).resolves.toBeUndefined();
  });
});
