import { describe, expect, it } from 'vitest';
import {
  cachedWorkoutsForRevision,
  cachedWorkoutsSince,
  type CachedWorkoutSnapshot,
} from './workoutCache';
import type { TrackedWorkout } from './types';

const workouts = [
  { id: 'recent', workout_date: '2026-06-01' },
  { id: 'older', workout_date: '2025-12-01' },
] as TrackedWorkout[];
const windowed = { revision: 'one', workouts, since: '2025-11-01' } satisfies CachedWorkoutSnapshot;

describe('workout cache revision matching', () => {
  it('reuses workouts only while the server revision matches', () => {
    expect(cachedWorkoutsForRevision(windowed, 'one', '2025-11-01')).toHaveLength(2);
    expect(cachedWorkoutsForRevision(windowed, 'two', '2025-11-01')).toBeNull();
    expect(cachedWorkoutsForRevision(null, 'one', '2025-11-01')).toBeNull();
  });

  it('serves a window only from a cache reaching back that far', () => {
    expect(
      cachedWorkoutsForRevision(windowed, 'one', '2026-05-01')?.map((item) => item.id),
    ).toEqual(['recent']);
    expect(cachedWorkoutsForRevision(windowed, 'one', '2025-05-01')).toBeNull();
  });
});

describe('offline workout history', () => {
  it('answers from any revision, but never claims history older than the cache holds', () => {
    expect(cachedWorkoutsSince(windowed, '2026-05-01')?.map((item) => item.id)).toEqual(['recent']);
    expect(cachedWorkoutsSince(windowed, '2025-11-01')).toHaveLength(2);
    expect(cachedWorkoutsSince(windowed, '2025-10-01')).toBeNull();
    expect(cachedWorkoutsSince(null, '2026-05-01')).toBeNull();
  });
});
