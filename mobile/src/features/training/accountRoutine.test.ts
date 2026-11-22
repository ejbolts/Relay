import type {
  ExerciseHistoryBaseline,
  TrackedSet,
  TrackedWorkout,
  WorkoutRecommendation,
  WorkoutTypeExercises,
} from '../../../../frontend/src/types';
import { accountRoutine } from './accountRoutine';

const exercise = (id: string, name: string, kind = 'strength') => ({ id, name, kind });

function set(reps: number | null, weight: number | null, extra: Partial<TrackedSet> = {}) {
  return {
    order_index: 0,
    reps,
    weight_kg: weight,
    duration_seconds: null,
    distance_km: null,
    warmup: false,
    completed: true,
    ...extra,
  } as TrackedSet;
}

function workout(
  date: string,
  movements: { exercise: ReturnType<typeof exercise>; sets: TrackedSet[] }[],
  extra: Partial<TrackedWorkout> = {},
) {
  return {
    id: date,
    workout_date: date,
    category: 'legs',
    workout_type_id: null,
    movements: movements.map((movement, order_index) => ({ ...movement, order_index })),
    ...extra,
  } as unknown as TrackedWorkout;
}

const plannedSets = (reps: number | null, count = 3) =>
  Array.from({ length: count }, () => ({ reps, weight_kg: null }));

function recommendation(extra: Partial<WorkoutRecommendation> = {}) {
  return { category: 'legs', session_name: 'Legs workout', ...extra } as WorkoutRecommendation;
}

const squat = exercise('squat', 'Back Squat');
const press = exercise('press', 'Leg Press');
const curl = exercise('curl', 'Leg Curl');

const splitDay = {
  routine_day: {
    movements: [{ exercise: squat, sets: plannedSets(8), rep_range: { min: 6, max: 10 } }],
  },
} as unknown as Partial<WorkoutRecommendation>;

const savedToType = [
  { workout_type_id: 'legs', movements: [{ exercise: press, sets: plannedSets(12, 2) }] },
] as unknown as WorkoutTypeExercises[];

const lastLegs = workout('2026-11-18', [
  { exercise: curl, sets: [set(12, 30), set(11, 30, { order_index: 1 })] },
]);

test('prefers the split day, then the saved type, then the last workout of that type', () => {
  const fromSplit = accountRoutine(recommendation(splitDay), savedToType, [lastLegs], [], 'kg');
  expect(fromSplit.name).toBe('Legs workout');
  expect(fromSplit.exercises).toEqual([
    expect.objectContaining({ name: 'Back Squat', sets: 3, reps: '6–10', previous: null }),
  ]);

  const fromType = accountRoutine(recommendation(), savedToType, [lastLegs], [], 'kg');
  expect(fromType.exercises).toEqual([
    expect.objectContaining({ name: 'Leg Press', sets: 2, reps: '12' }),
  ]);

  const fromHistory = accountRoutine(recommendation(), [], [lastLegs], [], 'kg');
  expect(fromHistory.exercises).toEqual([
    expect.objectContaining({
      name: 'Leg Curl',
      sets: 2,
      reps: '11–12',
      previous: '30 kg × 11 reps',
    }),
  ]);
});

test('shows the last performed set, skipping warm-ups and unticked rows', () => {
  const recent = [
    workout('2026-11-20', [
      {
        exercise: squat,
        sets: [
          set(5, 60, { warmup: true }),
          set(8, 100, { order_index: 1 }),
          set(6, 100, { order_index: 2 }),
          set(8, 100, { order_index: 3, completed: false }),
        ],
      },
    ]),
    workout('2026-11-13', [{ exercise: squat, sets: [set(8, 95)] }]),
  ];
  const routine = accountRoutine(recommendation(splitDay), [], recent, [], 'kg');
  expect(routine.exercises[0].previous).toBe('100 kg × 6 reps');
});

test('uses the condensed older history for a lift missing from the recent window', () => {
  const older = [
    { exercise_id: 'squat', latest: { sets: [set(5, 102.5)] } },
    { exercise_id: 'press', latest: null },
  ] as unknown as ExerciseHistoryBaseline[];
  const routine = accountRoutine(recommendation(splitDay), [], [], older, 'lb');
  expect(routine.exercises[0].previous).toBe('226 lb × 5 reps');
});

test('a recent set wins over the older history', () => {
  const recent = [workout('2026-11-20', [{ exercise: squat, sets: [set(6, 100)] }])];
  const older = [
    { exercise_id: 'squat', latest: { sets: [set(5, 90)] } },
  ] as unknown as ExerciseHistoryBaseline[];
  const routine = accountRoutine(recommendation(splitDay), [], recent, older, 'kg');
  expect(routine.exercises[0].previous).toBe('100 kg × 6 reps');
});

test('explains a rest day, a split that needs updating and no plan', () => {
  expect(accountRoutine(recommendation({ is_rest_day: true }), [], [], [], 'kg')).toEqual({
    name: 'Rest day',
    empty: 'No exercises scheduled today.',
    exercises: [],
  });
  expect(accountRoutine(recommendation({ needs_split_update: true }), [], [], [], 'kg').empty).toBe(
    'Update your training split in Relay.',
  );
  expect(accountRoutine(null, [], [], [], 'kg').empty).toBe('No workout planned.');
  expect(accountRoutine(recommendation(), [], [], [], 'kg')).toEqual({
    name: 'Legs workout',
    empty: 'No exercises planned yet.',
    exercises: [],
  });
});

test('a custom workout type only repeats workouts of that type', () => {
  const type = { id: 'type-1', is_custom: true };
  const next = recommendation({ workout_type: type } as Partial<WorkoutRecommendation>);
  const builtIn = workout('2026-11-19', [{ exercise: curl, sets: [set(12, 30)] }]);
  const custom = workout('2026-11-12', [{ exercise: press, sets: [set(10, 180)] }], {
    workout_type_id: 'type-1',
  });
  const routine = accountRoutine(next, [], [builtIn, custom], [], 'kg');
  expect(routine.exercises.map((item) => item.name)).toEqual(['Leg Press']);
});
