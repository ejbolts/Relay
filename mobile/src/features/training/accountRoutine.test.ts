import type {
  TrackedSet,
  TrackedWorkout,
  WorkoutRecommendation,
  WorkoutType,
  WorkoutTypeExercises,
} from '../../../../frontend/src/types';
import { accountRoutine } from './accountRoutine';

const TODAY = '2026-11-22';
const exercise = (id: string, name: string, kind = 'strength') => ({ id, name, kind });

function set(reps: number | null, weight: number | null, extra: Partial<TrackedSet> = {}) {
  return {
    order_index: 0,
    reps,
    weight_kg: weight,
    duration_seconds: null,
    distance_km: null,
    set_type: 'normal',
    warmup: false,
    failed: false,
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
    created_at: `${date}T09:00:00Z`,
    category: 'lower',
    workout_type_id: null,
    movements: movements.map((movement, order_index) => ({ ...movement, order_index })),
    ...extra,
  } as unknown as TrackedWorkout;
}

const legs: WorkoutType = {
  id: 'lower',
  name: 'Legs',
  color: '#3b82f6',
  is_custom: false,
  archived: false,
};
const custom: WorkoutType = {
  id: 'type-1',
  name: 'Full body A',
  color: '#123456',
  is_custom: true,
  archived: false,
};

const plannedSets = (reps: number | null, count = 3) =>
  Array.from({ length: count }, () => ({ reps, weight_kg: null, set_type: 'normal' }));

function recommendation(extra: Partial<WorkoutRecommendation> = {}) {
  return {
    category: 'lower',
    session_name: 'Legs workout',
    workout_type: null,
    is_rest_day: false,
    needs_split_update: false,
    ...extra,
  } as WorkoutRecommendation;
}

const squat = exercise('squat', 'Back Squat');
const press = exercise('press', 'Leg Press');
const curl = exercise('curl', 'Leg Curl');
const run = exercise('run', 'Running', 'cardio');

const splitDay = {
  split_name: 'Upper / lower',
  routine_day: {
    workout_type_id: null,
    workout_type: legs,
    movements: [
      {
        exercise_id: 'squat',
        exercise: squat,
        sets: plannedSets(8),
        rep_range: { min: 6, max: 10 },
      },
    ],
  },
} as unknown as Partial<WorkoutRecommendation>;

const savedToType = [
  { workout_type_id: 'lower', movements: [{ exercise: press, sets: plannedSets(12, 2) }] },
] as unknown as WorkoutTypeExercises[];

const lastLegs = workout('2026-11-18', [
  { exercise: curl, sets: [set(11, 30), set(12, 30, { order_index: 1 })] },
]);

function routine(
  next: WorkoutRecommendation | null,
  {
    saved = [] as WorkoutTypeExercises[],
    workouts = [] as TrackedWorkout[],
    types = [legs, custom],
    unit = 'kg' as const as 'kg' | 'lb',
  } = {},
) {
  return accountRoutine({ recommendation: next, types, saved, workouts, unit, today: TODAY });
}

test('prefers the split day, then the saved type, then the last workout of that type', () => {
  const fromSplit = routine(recommendation(splitDay), { saved: savedToType, workouts: [lastLegs] });
  expect(fromSplit.name).toBe('Legs workout');
  expect(fromSplit.exercises).toEqual([
    expect.objectContaining({ name: 'Back Squat', sets: 3, reps: '6–10', previous: null }),
  ]);

  const fromType = routine(recommendation(), { saved: savedToType, workouts: [lastLegs] });
  expect(fromType.exercises).toEqual([
    expect.objectContaining({ name: 'Leg Press', sets: 2, reps: '12' }),
  ]);

  const fromHistory = routine(recommendation(), { workouts: [lastLegs] });
  expect(fromHistory.exercises).toEqual([
    { name: 'Leg Curl', sets: 2, reps: '11–12', previous: '30 kg × 12', image: undefined },
  ]);
});

test("shows each lift's top working set from its newest workout, as Home does", () => {
  const workouts = [
    workout('2026-11-20', [
      {
        exercise: squat,
        sets: [
          set(5, 60, { set_type: 'warmup', warmup: true }),
          set(8, 100, { order_index: 1 }),
          set(6, 105, { order_index: 2 }),
          set(8, 120, { order_index: 3, completed: false }),
        ],
      },
    ]),
    workout('2026-11-13', [{ exercise: squat, sets: [set(3, 110)] }]),
    // A workout dated after today is not history yet.
    workout('2026-11-25', [{ exercise: squat, sets: [set(1, 140)] }]),
  ];
  expect(routine(recommendation(splitDay), { workouts }).exercises[0].previous).toBe('105 kg × 6');
  expect(routine(recommendation(splitDay), { workouts, unit: 'lb' }).exercises[0].previous).toBe(
    '231.49 lb × 6',
  );
});

test('a cardio row shows what was done last time', () => {
  const lastRun = workout(
    '2026-11-19',
    [{ exercise: run, sets: [set(null, null, { duration_seconds: 1800, distance_km: 5 })] }],
    { category: 'cardio' },
  );
  const next = recommendation({ category: 'cardio', session_name: 'Cardio' });
  const [row] = routine(next, { workouts: [lastRun] }).exercises;
  expect(row.name).toBe('Running');
  expect(row.previous).toMatch(/30 min/);
});

test('explains a rest day, a split that needs updating and no plan', () => {
  expect(routine(recommendation({ is_rest_day: true }))).toEqual({
    name: 'Rest day',
    empty: 'No exercises scheduled today.',
    exercises: [],
  });
  expect(routine(recommendation({ needs_split_update: true })).empty).toBe(
    'Update your training split in Relay.',
  );
  expect(routine(null).empty).toBe('No workout planned.');
  expect(routine(recommendation())).toEqual({
    name: 'Legs workout',
    empty: 'No exercises planned yet.',
    exercises: [],
  });
});

test('a removed workout type is not offered, unless a split still points at it', () => {
  const removed = { ...custom, archived: true };
  const next = recommendation({ category: 'other', workout_type: removed });
  expect(routine(next, { types: [legs, removed] }).empty).toBe('No workout planned.');
  const fromSplit = recommendation({ ...next, split_name: 'My split' });
  expect(routine(fromSplit, { types: [legs, removed] }).empty).toBe(
    'Update your training split in Relay.',
  );
});

test('a custom workout type only repeats workouts of that type', () => {
  const next = recommendation({ category: 'other', workout_type: custom });
  const builtIn = workout('2026-11-19', [{ exercise: curl, sets: [set(12, 30)] }], {
    category: 'other',
  });
  const own = workout('2026-11-12', [{ exercise: press, sets: [set(10, 180)] }], {
    category: 'other',
    workout_type_id: 'type-1',
  });
  const view = routine(next, { workouts: [builtIn, own] });
  expect(view.exercises.map((item) => item.name)).toEqual(['Leg Press']);
});
