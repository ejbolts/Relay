// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import {
  cachedSharedProfile,
  clearSharedProfileCache,
  forgetSharedProfile,
  pendingSharedProfile,
  prefetchSharedProfile,
  prefetchSharedProfiles,
  PREFETCH_LIMIT,
  updateCachedReactions,
  workoutsFromCache,
} from './sharedProfileCache';
import type { SharedProfile, SharedWorkoutPage, TrackedWorkout } from './types';

const profile = { id: 'alex', display_name: 'Alex Sample', can_view: true } as SharedProfile;
const workout = (id: string, workout_date: string) =>
  ({ id, workout_date, name: id, movements: [] }) as unknown as TrackedWorkout;
const page: SharedWorkoutPage = {
  total: 3,
  workouts: [workout('w3', '2026-11-12'), workout('w2', '2026-11-12'), workout('w1', '2026-11-10')],
  personal_records: [
    { id: 'r1', workout_id: 'w3', set_id: 's1' },
    { id: 'r2', workout_id: 'w1', set_id: 's2' },
  ] as SharedWorkoutPage['personal_records'],
  reactions: { w3: { counts: [], yours: null }, w1: { counts: [], yours: null } },
};

beforeEach(() => {
  clearSharedProfileCache();
  vi.spyOn(api.sharing, 'profile').mockImplementation(async (id) => ({ ...profile, id }));
  vi.spyOn(api.sharing, 'workouts').mockResolvedValue(page);
  vi.spyOn(api.sharing, 'workoutFilters').mockResolvedValue({ exercises: [], machines: [] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('loads a profile once, shares the request under way, and reuses the recent copy', async () => {
  const first = prefetchSharedProfile('me', 'alex', 'w3:4');
  expect(pendingSharedProfile('me', 'alex')).toBe(first);
  expect(prefetchSharedProfile('me', 'alex', 'w3:4')).toBe(first);
  await first;

  expect(api.sharing.profile).toHaveBeenCalledTimes(1);
  expect(api.sharing.workouts).toHaveBeenCalledWith('alex', 0, 10, {});
  expect(pendingSharedProfile('me', 'alex')).toBeNull();
  expect(cachedSharedProfile('me', 'alex')?.page).toBe(page);

  await prefetchSharedProfile('me', 'alex', 'w3:4');
  expect(api.sharing.profile).toHaveBeenCalledTimes(1);
});

it('loads again once the friend logs a session or the copy is five minutes old', async () => {
  const start = Date.now();
  await prefetchSharedProfile('me', 'alex', 'w3:4', start);
  await prefetchSharedProfile('me', 'alex', 'w4:5', start + 1000);
  expect(api.sharing.profile).toHaveBeenCalledTimes(2);
  await prefetchSharedProfile('me', 'alex', 'w4:5', start + 2000);
  expect(api.sharing.profile).toHaveBeenCalledTimes(2);
  await prefetchSharedProfile('me', 'alex', 'w4:5', start + 6 * 60_000);
  expect(api.sharing.profile).toHaveBeenCalledTimes(3);
});

it('stops showing a copy after ten minutes and never shows another account’s copy', async () => {
  const start = Date.now();
  await prefetchSharedProfile('me', 'alex', null, start);
  expect(cachedSharedProfile('me', 'alex', start + 9 * 60_000)).not.toBeNull();
  expect(cachedSharedProfile('me', 'alex', start + 11 * 60_000)).toBeNull();

  await prefetchSharedProfile('me', 'alex', null, start);
  expect(cachedSharedProfile('someone-else', 'alex', start)).toBeNull();
  expect(cachedSharedProfile('me', 'alex', start)).toBeNull();
});

it('skips background loading while offline, hidden or saving data, and after a failure', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  expect(await prefetchSharedProfile('me', 'alex')).toBeNull();
  vi.restoreAllMocks();

  vi.spyOn(api.sharing, 'profile').mockRejectedValue(new Error('offline'));
  vi.spyOn(api.sharing, 'workouts').mockResolvedValue(page);
  vi.spyOn(api.sharing, 'workoutFilters').mockResolvedValue({ exercises: [], machines: [] });
  expect(await prefetchSharedProfile('me', 'alex')).toBeNull();
  expect(cachedSharedProfile('me', 'alex')).toBeNull();

  vi.stubGlobal('navigator', { onLine: true, connection: { saveData: true } });
  vi.mocked(api.sharing.profile).mockClear();
  expect(await prefetchSharedProfile('me', 'casey')).toBeNull();
  expect(api.sharing.profile).not.toHaveBeenCalled();
});

it('warms only the first five profiles, one at a time, and stops when asked', async () => {
  vi.useFakeTimers();
  const targets = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id, signature: null }));
  prefetchSharedProfiles('me', targets);
  expect(api.sharing.profile).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(250);
  expect(api.sharing.profile).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5000);
  expect(vi.mocked(api.sharing.profile).mock.calls.map(([id]) => id)).toEqual(
    targets.slice(0, PREFETCH_LIMIT).map((target) => target.id),
  );

  clearSharedProfileCache();
  vi.mocked(api.sharing.profile).mockClear();
  const stop = prefetchSharedProfiles('me', targets);
  await vi.advanceTimersByTimeAsync(250);
  stop();
  await vi.advanceTimersByTimeAsync(5000);
  expect(api.sharing.profile).toHaveBeenCalledTimes(1);
});

it('keeps a reaction made since, and forgets a profile whose access changed', async () => {
  await prefetchSharedProfile('me', 'alex');
  const yours = { counts: [{ reaction: 'love' as const, count: 1 }], yours: 'love' as const };
  updateCachedReactions('me', 'alex', 'w3', yours);
  updateCachedReactions('me', 'alex', 'unlisted', yours);
  expect(cachedSharedProfile('me', 'alex')?.page.reactions).toEqual({
    ...page.reactions,
    w3: yours,
  });
  forgetSharedProfile('me', 'alex');
  expect(cachedSharedProfile('me', 'alex')).toBeNull();
});

it('answers a linked workout from the first page with that day’s sessions only', () => {
  expect(workoutsFromCache(page)).toBe(page);
  expect(workoutsFromCache(page, { id: 'older', workout_date: '2026-10-01' })).toBeNull();
  const day = workoutsFromCache(page, { id: 'w3', workout_date: '2026-11-12' })!;
  expect(day.workouts.map((item) => item.id)).toEqual(['w3', 'w2']);
  expect(day.total).toBe(2);
  expect(day.personal_records.map((record) => record.id)).toEqual(['r1']);
  expect(Object.keys(day.reactions ?? {})).toEqual(['w3']);
});
