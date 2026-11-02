import { describe, expect, it } from 'vitest';
import { formatVolume, plannedWeeklyVolume, targetStatus } from './splitTargets';
import type { Exercise, RoutineDay, RoutineSet } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';

const exercise = (patch: Partial<Exercise>): Exercise => ({
  id: 'bench',
  name: 'Bench press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: null,
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
  ...patch,
});
const set = (patch: Partial<RoutineSet> = {}): RoutineSet => ({
  reps: 8,
  weight_kg: null,
  duration_seconds: null,
  distance_km: null,
  rest_seconds: null,
  set_type: 'normal',
  ...patch,
});
const [upper, lower] = DEFAULT_WORKOUT_TYPES;
const day = (movements: RoutineDay['movements']): RoutineDay => ({
  workout_type_id: upper.id,
  workout_type: upper,
  movements,
});
const rest: RoutineDay = { workout_type_id: null, workout_type: null, movements: [] };

const bench = exercise({
  muscle_set_credits: [
    { muscle_name: 'Chest', sets: 1 },
    { muscle_name: 'Triceps', sets: 0.5 },
  ],
});
const squat = exercise({ id: 'squat', name: 'Squat', category: 'lower', muscle_group: 'Quads' });
const walk = exercise({ id: 'walk', name: 'Incline walk', category: 'cardio', kind: 'cardio' });

describe('plannedWeeklyVolume', () => {
  it('counts working sets with part credits for a seven-day cycle', () => {
    const week = [
      day([
        {
          exercise_id: bench.id,
          exercise: bench,
          sets: [set({ set_type: 'warmup' }), set(), set(), set({ set_type: 'drop' })],
        },
      ]),
      ...Array.from({ length: 6 }, () => rest),
    ];
    const volume = plannedWeeklyVolume(week);
    expect(volume.cycleDays).toBe(7);
    expect(volume.muscles).toEqual([
      { muscle: 'Chest', sets: 3 },
      { muscle: 'Triceps', sets: 1.5 },
    ]);
    expect(volume.cardioMinutes).toBe(0);
  });

  it('averages a cycle that does not line up with a week', () => {
    const volume = plannedWeeklyVolume([
      day([{ exercise_id: bench.id, exercise: bench, sets: [set(), set(), set(), set()] }]),
      {
        workout_type_id: lower.id,
        workout_type: lower,
        movements: [{ exercise_id: squat.id, exercise: squat, sets: [set(), set()] }],
      },
      day([{ exercise_id: walk.id, exercise: walk, sets: [set({ duration_seconds: 2700 })] }]),
      rest,
    ]);
    expect(volume.muscles).toEqual([
      { muscle: 'Chest', sets: 7 },
      { muscle: 'Quads', sets: 3.5 },
      { muscle: 'Triceps', sets: 3.5 },
    ]);
    expect(volume.cardioMinutes).toBeCloseTo(78.75);
  });

  it('falls back to the main muscle for exercises without detailed credits', () => {
    const custom = exercise({
      id: 'custom',
      muscle_group: ' Forearms ',
      muscle_set_credits: undefined,
    });
    expect(
      plannedWeeklyVolume([day([{ exercise_id: custom.id, exercise: custom, sets: [set()] }])])
        .muscles,
    ).toEqual([{ muscle: 'Forearms', sets: 7 }]);
  });

  it('ignores movements left on a day changed to rest', () => {
    expect(
      plannedWeeklyVolume([
        { ...rest, movements: [{ exercise_id: bench.id, exercise: bench, sets: [set()] }] },
      ]).muscles,
    ).toEqual([]);
  });
});

describe('targetStatus', () => {
  it('marks met, close and under targets using the displayed value', () => {
    expect(targetStatus(10, 10)).toBe('met');
    expect(targetStatus(9.96, 10)).toBe('met');
    expect(targetStatus(7, 10)).toBe('close');
    expect(targetStatus(6.9, 10)).toBe('under');
    expect(formatVolume(8.75)).toBe('8.8');
    expect(formatVolume(7)).toBe('7');
  });
});
