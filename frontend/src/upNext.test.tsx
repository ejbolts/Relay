import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { useUpNextSession } from './upNext';
import type { RoutineMovement, TrackedWorkout, WorkoutRecommendation } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';
import { WorkoutTypesContext } from './workoutTypesContext';

function read(
  recommendation: WorkoutRecommendation,
  workouts: TrackedWorkout[] = [],
  savedExercises: Record<string, RoutineMovement[]> = {},
) {
  let result!: ReturnType<typeof useUpNextSession>;
  function Harness() {
    result = useUpNextSession(recommendation, workouts, '2026-10-26');
    return null;
  }
  renderToStaticMarkup(
    <WorkoutTypesContext.Provider
      value={{
        types: DEFAULT_WORKOUT_TYPES,
        loading: false,
        error: null,
        reload: async () => undefined,
        applySaved: () => undefined,
        savedExercises,
        applySavedExercises: () => undefined,
      }}
    >
      <Harness />
    </WorkoutTypesContext.Provider>,
  );
  return result;
}
const custom = {
  id: 'custom-a',
  name: 'Full body A',
  color: '#123456',
  is_custom: true,
  archived: false,
};
const scheduled: WorkoutRecommendation = {
  category: 'other',
  session_name: 'Full body A workout',
  rotation_next: 'other',
  reason: 'Day 1',
  muscle_frequency: [],
  workout_type: custom,
  split_name: 'My split',
  scheduled_date: '2026-10-26',
};

it('uses custom metadata even before the local type catalogue refreshes', () => {
  const result = read(scheduled);
  expect(result.label).toBe('Full body A');
  expect(result.type).toEqual(custom);
  expect(result.needsSplitUpdate).toBe(false);
});
it('represents rest without creating a workout template', () => {
  const result = read({ ...scheduled, workout_type: null, is_rest_day: true });
  expect(result.isRestDay).toBe(true);
  expect(result.label).toBe('Rest');
  expect(result.template).toBeNull();
});
it('retains the split warning for a type removed after it was scheduled', () => {
  const result = read({
    ...scheduled,
    workout_type: { ...custom, archived: true },
    needs_split_update: true,
  });
  expect(result.recommendation).not.toBeNull();
  expect(result.needsSplitUpdate).toBe(true);
  expect(result.template).toBeNull();
});

const bench = { id: 'bench', name: 'Bench Press', kind: 'strength' } as never;
const row = { id: 'row', name: 'Cable Row', kind: 'strength' } as never;
const lastPush = {
  id: 'push-1',
  name: 'Push workout',
  workout_date: '2026-10-24',
  category: 'push',
  workout_type_id: null,
  created_at: '2026-10-24T10:00:00Z',
  movements: [
    { exercise: bench, order_index: 0, sets: [{ weight_kg: 80, reps: 5, completed: true }] },
    { exercise: row, order_index: 1, sets: [{ weight_kg: 60, reps: 8, completed: true }] },
  ],
} as unknown as TrackedWorkout;
const pushDay: WorkoutRecommendation = {
  category: 'push',
  session_name: 'Push workout',
  rotation_next: 'push',
  reason: 'Day 1',
  muscle_frequency: [],
  workout_type: { id: 'push', name: 'Push', color: '#123456', is_custom: false, archived: false },
  split_name: 'My split',
  scheduled_date: '2026-10-26',
};

it('pre-fills from the last session of the type when the routine day has no exercises', () => {
  const emptyDay = { workout_type_id: 'push', workout_type: pushDay.workout_type!, movements: [] };
  const result = read({ ...pushDay, routine_day: emptyDay }, [lastPush]);
  expect(result.template?.sourceWorkout.id).toBe('push-1');
  expect(result.template?.exercises.map((item) => item.exercise.name)).toEqual([
    'Bench Press',
    'Cable Row',
  ]);
});
it('stays empty when an empty routine day has no earlier session to copy', () => {
  const emptyDay = { workout_type_id: 'push', workout_type: pushDay.workout_type!, movements: [] };
  expect(read({ ...pushDay, routine_day: emptyDay }).template).toBeNull();
});
it('keeps the routine exercises when the routine day has them', () => {
  const day = {
    workout_type_id: 'push',
    workout_type: pushDay.workout_type!,
    movements: [{ exercise_id: 'bench', exercise: bench, sets: [] }],
  };
  const result = read({ ...pushDay, routine_day: day }, [lastPush]);
  expect(result.template?.sourceWorkout.id).toBe('routine-template');
  expect(result.template?.exercises).toHaveLength(1);
});
it("uses the type's saved exercises before the last session when a routine day is empty", () => {
  const emptyDay = { workout_type_id: 'push', workout_type: pushDay.workout_type!, movements: [] };
  const saved = [
    {
      exercise_id: 'row',
      exercise: row,
      sets: [
        {
          reps: 10,
          weight_kg: 40,
          duration_seconds: null,
          distance_km: null,
          rest_seconds: 90,
          set_type: 'normal' as const,
        },
      ],
    },
  ];
  const result = read({ ...pushDay, routine_day: emptyDay }, [lastPush], { push: saved });
  expect(result.template?.planned).toBe('type');
  expect(result.template?.exercises.map((item) => item.exercise.name)).toEqual(['Cable Row']);
  expect(result.template?.exercises[0].plannedSets?.[0].weight_kg).toBe(40);
  // Without a split, a recommended type uses its saved exercises too.
  const unscheduled = read({ ...pushDay, split_name: null }, [lastPush], { push: saved });
  expect(unscheduled.template?.planned).toBe('type');
});
