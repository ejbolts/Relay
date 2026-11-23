import { expect, it } from 'vitest';
import {
  PREFETCH_LIMIT,
  PREFETCH_REFRESH_MS,
  prefetchedCopyIsCurrent,
  profilePrefetchTargets,
  profileSignature,
} from './profilePrefetch';
import type { FriendActivity } from './types';

const friend = (id: string, presence: FriendActivity['presence'] = null): FriendActivity => ({
  id,
  display_name: `Sample ${id}`,
  profile_photo_url: null,
  since: '2026-10-01T10:00:00Z',
  latest: null,
  recent_workout_count: 2,
  training_dates: [],
  presence,
});

it('warms the first few friends, training now first', () => {
  const friends = Array.from({ length: 8 }, (_, index) => friend(`f${index}`));
  friends[6] = friend('live', {
    online: true,
    last_active_at: null,
    workout: { name: 'Push', kind: 'strength', started_at: '2026-11-23T08:00:00Z' },
  });
  const targets = profilePrefetchTargets(friends);
  expect(targets).toHaveLength(PREFETCH_LIMIT);
  expect(targets[0]).toEqual({ id: 'live', signature: ':2' });
});

it("reloads a copy once it's old or the friend has logged a session", () => {
  const signature = profileSignature({ latest: null, recent_workout_count: 3 });
  const copy = { fetchedAt: 1_000, signature };
  expect(prefetchedCopyIsCurrent(copy, signature, 1_000 + PREFETCH_REFRESH_MS - 1)).toBe(true);
  expect(prefetchedCopyIsCurrent(copy, signature, 1_000 + PREFETCH_REFRESH_MS)).toBe(false);
  expect(prefetchedCopyIsCurrent(copy, ':4', 2_000)).toBe(false);
  expect(prefetchedCopyIsCurrent(copy, null, 2_000)).toBe(true);
  expect(prefetchedCopyIsCurrent(null, signature, 2_000)).toBe(false);
});
