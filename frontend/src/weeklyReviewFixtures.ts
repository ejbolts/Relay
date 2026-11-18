import type { CardioWeek, Exercise, PersonalRecord, TrackedSet, TrackedWorkout } from './types';

export const reviewExercise = (id: string, name: string): Exercise => ({
  id,
  name,
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
});

export const reviewSet = (
  weight: number,
  reps: number,
  extra: Partial<TrackedSet> = {},
): TrackedSet => ({
  id: crypto.randomUUID(),
  order_index: 0,
  reps,
  weight_kg: weight,
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
  ...extra,
});

export function reviewWorkout(
  id: string,
  date: string,
  sets: TrackedSet[],
  extra: Partial<TrackedWorkout> = {},
): TrackedWorkout {
  return {
    id,
    name: `Workout ${id}`,
    workout_date: date,
    category: 'push',
    notes: null,
    duration_minutes: 60,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: `${date}T10:00:00Z`,
    updated_at: `${date}T10:00:00Z`,
    movements: [
      {
        id: `${id}-m`,
        order_index: 0,
        notes: null,
        exercise: reviewExercise('bench', 'Bench Press'),
        sets,
        machine_photos: [],
        superset_group_id: null,
        superset_name: null,
      },
    ],
    ...extra,
  };
}

export const reviewRecord = (
  id: string,
  date: string,
  extra: Partial<PersonalRecord> = {},
): PersonalRecord => ({
  id,
  exercise_id: 'bench',
  workout_id: 'w',
  set_id: id,
  achieved_date: date,
  record_type: 'weight',
  value: 100,
  unit: 'kg',
  normalized_weight: null,
  weight_kg: 100,
  formula: null,
  exercise_name: 'Bench Press',
  ...extra,
});

/** Goal zones map to [completed, goal] minutes. */
export const reviewCardioWeek = (
  weekStart: string,
  totalMinutes: number,
  zones: Record<number, [number, number]>,
): CardioWeek => ({
  week_start: weekStart,
  total_minutes: totalMinutes,
  goals: Object.entries(zones).map(([zone, [completed, goal]]) => ({
    zone: Number(zone),
    goal_minutes: goal,
    completed_minutes: completed,
    remaining_minutes: Math.max(0, goal - completed),
    complete: completed >= goal,
  })),
});
