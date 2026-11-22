import type {
  CardioOverview,
  DashboardData,
  Exercise,
  ExerciseLibrarySummary,
  ExerciseProgress,
  HeatmapDay,
  PersonalRecord,
  TrackedSet,
  TrackedWorkout,
  TrainingPreferences,
} from '../../../../frontend/src/types';
import { DEFAULT_WORKOUT_TYPES } from '../../../../frontend/src/workoutTypes';

/** Sample training for Training's tests, around Sunday 22 November 2026. */
export const TODAY = new Date('2026-11-22T10:00:00');

export function exercise(id: string, name: string, fields: Partial<Exercise> = {}): Exercise {
  return {
    id,
    name,
    category: 'upper',
    kind: 'strength',
    muscle_group: 'Chest',
    equipment: 'Barbell',
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
    ...fields,
  };
}

export const bench = exercise('bench', 'Bench Press');
export const squat = exercise('squat', 'Back Squat', {
  category: 'lower',
  muscle_group: 'Quads',
});
export const running = exercise('running', 'Running', { category: 'cardio', kind: 'cardio' });

function set(id: string, fields: Partial<TrackedSet>): TrackedSet {
  return {
    id,
    order_index: 0,
    reps: null,
    weight_kg: null,
    rpe: null,
    rest_seconds: null,
    duration_seconds: null,
    distance_km: null,
    incline_percent: null,
    speed_kph: null,
    bodyweight_kg: null,
    percentile: null,
    warmup: false,
    set_type: 'normal',
    failed: false,
    target_reps: null,
    notes: null,
    completed: true,
    ...fields,
  };
}

function workout(
  id: string,
  name: string,
  date: string,
  category: TrackedWorkout['category'],
  movements: [Exercise, TrackedSet[]][],
  fields: Partial<TrackedWorkout> = {},
): TrackedWorkout {
  return {
    id,
    name,
    workout_date: date,
    category,
    workout_type_id: category,
    notes: null,
    duration_minutes: 62,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: `${date}T09:00:00Z`,
    updated_at: `${date}T10:00:00Z`,
    movements: movements.map(([item, sets], index) => ({
      id: `${id}-m${index}`,
      order_index: index,
      notes: null,
      exercise: item,
      sets: sets.map((entry, order) => ({ ...entry, order_index: order })),
      machine_photos: [],
      superset_group_id: null,
      superset_name: null,
    })),
    ...fields,
  };
}

export const upper = workout(
  'w-upper',
  'Sample upper session',
  '2026-11-21',
  'upper',
  [
    [
      bench,
      [
        set('s-warm', { weight_kg: 60, reps: 8, set_type: 'warmup', warmup: true }),
        set('s-top', { weight_kg: 100, reps: 5, rpe: 8 }),
        set('s-back', { weight_kg: 95, reps: 6 }),
      ],
    ],
  ],
  { is_sample: true },
);
export const conditioning = workout(
  'w-run',
  'Sample conditioning',
  '2026-11-21',
  'cardio',
  [[running, [set('s-run', { duration_seconds: 1920, distance_km: 4.8 })]]],
  { duration_minutes: 32, is_sample: true },
);
export const lower = workout('w-lower', 'Sample lower session', '2026-11-19', 'lower', [
  [squat, [set('s-squat', { weight_kg: 140, reps: 5 })]],
]);
export const pull = workout('w-pull', 'Pull day', '2026-11-10', 'pull', [
  [bench, [set('s-pull', { weight_kg: 90, reps: 8 })]],
]);
export const oldPush = workout('w-old', 'Old push', '2026-03-02', 'push', [
  [bench, [set('s-old', { weight_kg: 80, reps: 8 })]],
]);

export const recentWorkouts = [upper, conditioning, lower, pull];

function heatmapDay(date: string, workouts: TrackedWorkout[]): HeatmapDay {
  return {
    workout_date: date,
    categories: workouts.map((item) => item.category),
    workout_types: workouts.map((item) =>
      DEFAULT_WORKOUT_TYPES.find((type) => type.id === item.category)!,
    ),
    workout_count: workouts.length,
    set_count: workouts.reduce((total, item) => total + item.movements[0].sets.length, 0),
    workouts: workouts.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      workout_type_id: item.workout_type_id,
      duration_minutes: item.duration_minutes,
      exercises: item.movements.map((movement) => ({
        exercise_name: movement.exercise.name,
        set_count: movement.sets.length,
        bodyweight_kg: null,
      })),
    })),
  };
}

export const dashboard = {
  heatmap: [
    heatmapDay('2026-11-10', [pull]),
    heatmapDay('2026-11-19', [lower]),
    heatmapDay('2026-11-21', [upper, conditioning]),
  ],
  history: {
    total_workouts: 5,
    first_workout_date: '2026-03-02',
    last_workout_date: '2026-11-21',
    has_sample_workouts: true,
  },
} as unknown as DashboardData;

export const olderCalendar = [heatmapDay('2026-03-02', [oldPush])];

export const preferences: TrainingPreferences = {
  preferred_weight_unit: 'kg',
  week_start: 'monday',
  zone2_goal_minutes: 150,
  weekly_muscle_set_goal: 10,
};

export const records: PersonalRecord[] = [
  {
    id: 'pr-1',
    exercise_id: 'bench',
    workout_id: 'w-upper',
    set_id: 's-top',
    achieved_date: '2026-11-21',
    record_type: 'weight',
    value: 100,
    unit: 'kg',
    normalized_weight: 100,
    formula: null,
    exercise_name: 'Bench Press',
    scope: 'all_time',
  },
];

export const library: ExerciseLibrarySummary[] = [
  {
    exercise_id: 'bench',
    session_count: 3,
    last_date: '2026-11-21',
    latest_estimated_1rm: 116.7,
    change_kg: 6.7,
    change_percent: 6,
    trend: [
      { date: '2026-11-10', estimated_1rm: 110 },
      { date: '2026-11-21', estimated_1rm: 116.7 },
    ],
  },
  {
    exercise_id: 'squat',
    session_count: 1,
    last_date: '2026-11-19',
    latest_estimated_1rm: 163.3,
    change_kg: null,
    change_percent: null,
    trend: [],
  },
];

export const benchProgress: ExerciseProgress = {
  exercise: bench,
  points: [
    {
      workout_date: '2026-11-10',
      workout_id: 'w-pull',
      best_weight_kg: 90,
      best_reps: 8,
      estimated_1rm: 114,
      volume_kg: 720,
      best_rpe: null,
    },
    {
      workout_date: '2026-11-21',
      workout_id: 'w-upper',
      best_weight_kg: 100,
      best_reps: 5,
      estimated_1rm: 116.7,
      volume_kg: 1070,
      best_rpe: 8,
      relative_strength: 1.25,
      bodyweight_kg: 80,
    },
  ],
  personal_best_weight_kg: 100,
  personal_best_estimated_1rm: 116.7,
};

const week = {
  week_start: '2026-11-16',
  week_end: '2026-11-22',
  goal_minutes: 150,
  completed_minutes: 32,
  remaining_minutes: 118,
  percentage: 21,
  complete: false,
};

export const cardio: CardioOverview = {
  preferences,
  current_week: week,
  previous_weeks: [],
  goal_weeks: [
    { zone: 2, goal_minutes: 150, completed_minutes: 32, remaining_minutes: 118, complete: false },
  ],
  cardio_preferences: {
    heart_rate_zones: [{ zone: 2, min_bpm: 120, max_bpm: 140 }],
    goals: [{ zone: 2, minutes: 150 }],
  },
  energy_periods: [],
  sessions: [
    {
      id: 'c-run',
      session_date: '2026-11-21',
      activity_type: 'Running',
      duration_minutes: 32,
      calories_kcal: 385,
      average_heart_rate_bpm: 142,
      distance_km: 4.8,
      average_speed_kph: null,
      incline_percent: null,
      average_mets: null,
      intensity: null,
      zone: 'Zone 2',
      qualifies_zone2: true,
      notes: null,
      source_workout_id: 'w-run',
      workout_context: 'pure_cardio',
      created_at: '',
      updated_at: '',
    },
  ],
};
