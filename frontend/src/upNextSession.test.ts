import { expect, it } from 'vitest';
import type { TrackedWorkout, WorkoutRecommendation, WorkoutType } from './types';
import { upNextSession } from './upNextSession';

// The rule runs without React, the way the native app calls it.
const legs: WorkoutType = {
  id: 'lower',
  name: 'Legs',
  color: '#123456',
  is_custom: false,
  archived: false,
};
const squat = { id: 'squat', name: 'Back Squat', kind: 'strength' } as never;
const lastLegs = {
  id: 'legs-1',
  name: 'Legs workout',
  workout_date: '2026-10-24',
  category: 'lower',
  workout_type_id: null,
  created_at: '2026-10-24T10:00:00Z',
  movements: [
    { exercise: squat, order_index: 0, sets: [{ weight_kg: 100, reps: 5, completed: true }] },
  ],
} as unknown as TrackedWorkout;
const legsDay = {
  category: 'lower',
  session_name: 'Legs workout',
  workout_type: null,
} as unknown as WorkoutRecommendation;

const read = (recommendation: WorkoutRecommendation | null, types = [legs]) =>
  upNextSession({
    recommendation,
    workouts: [lastLegs],
    types,
    savedExercises: {},
    today: '2026-10-26',
    weightUnit: 'kg',
  });

it('finds a built-in type from the catalogue and repeats its last workout', () => {
  const result = read(legsDay);
  expect(result.label).toBe('Legs');
  expect(result.type).toBe(legs);
  expect(result.template?.sourceWorkout.id).toBe('legs-1');
});
it('drops a recommendation whose type was removed, unless a split still names it', () => {
  const removed = [{ ...legs, archived: true }];
  expect(read(legsDay, removed).recommendation).toBeNull();
  const fromSplit = read({ ...legsDay, split_name: 'My split' }, removed);
  expect(fromSplit.needsSplitUpdate).toBe(true);
  expect(fromSplit.template).toBeNull();
});
it('has nothing to offer without a recommendation', () => {
  expect(read(null)).toMatchObject({ recommendation: null, label: null, template: null });
});
