import { describe, expect, it } from 'vitest';
import type { HeatmapDay, WorkoutCategory } from './types';
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

describe('heatmapWithoutWorkouts on mixed days, as the server builds them', () => {
  const builtin = (id: string) => ({
    id,
    name: id,
    color: '#000000',
    is_custom: false,
    archived: false,
  });
  const arms = { id: 'arms', name: 'Arms', color: '#ec4899', is_custom: true, archived: false };
  const entry = (
    id: string,
    category: WorkoutCategory,
    exercises: string[],
    workout_type_id: string | null = null,
  ) => ({
    id,
    name: id,
    category,
    workout_type_id,
    duration_minutes: 40,
    exercises: exercises.map((exercise_name) => ({
      exercise_name,
      set_count: 3,
      bodyweight_kg: null,
    })),
  });
  const library: Record<string, { category: WorkoutCategory; kind: 'strength' | 'cardio' }> = {
    Bench: { category: 'upper', kind: 'strength' },
    Squat: { category: 'lower', kind: 'strength' },
    Treadmill: { category: 'cardio', kind: 'cardio' },
  };
  const lookup = (name: string) => library[name];
  const mixed = (
    workouts: ReturnType<typeof entry>[],
    categories: WorkoutCategory[],
    types: string[],
  ) =>
    ({
      workout_date: '2026-11-20',
      categories,
      workout_types: types.map((id) => (id === 'arms' ? arms : builtin(id))),
      workout_count: workouts.length,
      set_count: workouts.length * 3,
      workouts,
    }) as unknown as HeatmapDay;
  const look = (day: HeatmapDay) => ({
    categories: day.categories,
    types: day.workout_types?.map((type) => type.id),
  });

  it('an upper + lower day keeps upper once lower is deleted', () => {
    const day = mixed(
      [entry('a', 'upper', ['Bench']), entry('b', 'lower', ['Squat'])],
      ['full_body'],
      ['upper', 'lower'],
    );
    const expected = { categories: ['upper'], types: ['upper'] };
    expect(look(heatmapWithoutWorkouts([day], ['b'], lookup)[0])).toEqual(expected);
    expect(look(heatmapWithoutWorkouts([day], ['b'])[0])).toEqual(expected);
  });

  it('a kept workout with cardio exercises keeps the cardio arc', () => {
    const day = mixed(
      [entry('a', 'upper', ['Bench']), entry('b', 'other', ['Bench', 'Treadmill'], 'arms')],
      ['full_body', 'cardio'],
      ['upper', 'arms', 'cardio'],
    );
    const expected = { categories: ['other', 'cardio'], types: ['arms', 'cardio'] };
    expect(look(heatmapWithoutWorkouts([day], ['a'], lookup)[0])).toEqual(expected);
    expect(look(heatmapWithoutWorkouts([day], ['a'])[0])).toEqual(expected);
  });

  it('a cardio-category workout with strength sets keeps its strength colour', () => {
    const day = mixed(
      [entry('a', 'lower', ['Squat']), entry('b', 'cardio', ['Bench'])],
      ['full_body'],
      ['lower', 'upper'],
    );
    expect(look(heatmapWithoutWorkouts([day], ['a'], lookup)[0])).toEqual({
      categories: ['upper'],
      types: ['upper'],
    });
    // Without the exercise library it can't see the strength sets, but the day keeps a colour.
    const approximate = heatmapWithoutWorkouts([day], ['a'])[0];
    expect(approximate.categories.length).toBeGreaterThan(0);
  });

  it('falls back to the close rule when an exercise isn’t in the library', () => {
    const day = mixed(
      [entry('a', 'upper', ['Bench']), entry('b', 'lower', ['Mystery'])],
      ['full_body'],
      ['upper', 'lower'],
    );
    expect(look(heatmapWithoutWorkouts([day], ['a'], lookup)[0])).toEqual({
      categories: ['lower'],
      types: ['lower'],
    });
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
