import { describe, expect, it } from 'vitest';
import type { HeatmapDay } from './types';
import {
  heatmapWithoutWorkouts,
  queuedWorkoutIds,
  workoutBlockedWhileSyncing,
} from './workoutDeletion';

const workout = (id: string, category: 'upper' | 'cardio', sets: number, typeId?: string) => ({
  id,
  name: id,
  category,
  workout_type_id: typeId ?? null,
  duration_minutes: 40,
  exercises: [{ exercise_name: 'Row', set_count: sets, bodyweight_kg: null }],
});

const day = (date: string, workouts: ReturnType<typeof workout>[]): HeatmapDay =>
  ({
    workout_date: date,
    categories: [...new Set(workouts.map((item) => item.category))],
    workout_types: workouts.map((item) => ({
      id: item.workout_type_id ?? item.category,
      name: item.category,
      color: '#000000',
      is_custom: Boolean(item.workout_type_id),
      archived: false,
    })),
    workout_count: workouts.length,
    set_count: workouts.reduce((sum, item) => sum + item.exercises[0].set_count, 0),
    workouts,
  }) as unknown as HeatmapDay;

describe('heatmapWithoutWorkouts', () => {
  const days = [
    day('2026-11-20', [workout('a', 'upper', 5), workout('b', 'cardio', 1, 'run')]),
    day('2026-11-21', [workout('c', 'upper', 4)]),
  ];

  it('drops a workout from its day and works the day out again', () => {
    const [first, second] = heatmapWithoutWorkouts(days, ['b']);
    expect(first).toMatchObject({
      workout_count: 1,
      set_count: 5,
      categories: ['upper'],
      workout_types: [expect.objectContaining({ id: 'upper' })],
    });
    expect(first.workouts.map((item) => item.id)).toEqual(['a']);
    expect(second).toBe(days[1]);
  });

  it('drops a day left with no workouts, and leaves the days alone with nothing to remove', () => {
    expect(heatmapWithoutWorkouts(days, ['c']).map((item) => item.workout_date)).toEqual([
      '2026-11-20',
    ]);
    expect(heatmapWithoutWorkouts(days, [])).toBe(days);
    expect(heatmapWithoutWorkouts(days, ['elsewhere'])).toEqual(days);
  });
});

describe('workoutBlockedWhileSyncing', () => {
  it('blocks a workout not yet confirmed, or with changes waiting to sync', () => {
    const queued = queuedWorkoutIds([
      { pendingSave: { workoutId: 'w1' } },
      { pendingSave: { workoutId: null } },
    ] as never);
    expect([...queued]).toEqual(['w1']);
    expect(workoutBlockedWhileSyncing('w1', queued)).toBe(true);
    expect(workoutBlockedWhileSyncing('pending:abc', queued)).toBe(true);
    expect(workoutBlockedWhileSyncing('w2', queued)).toBe(false);
  });
});
