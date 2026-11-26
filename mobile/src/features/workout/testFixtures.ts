import type { SessionTemplate } from '../../../../frontend/src/trainingSummary';
import type { Exercise, TrackedSet, TrackedWorkout } from '../../../../frontend/src/types';
import { DEFAULT_WORKOUT_TYPES } from '../../../../frontend/src/workoutTypes';
import type { LoggerContext } from './loggerState';

// Sample account data for the logger's tests.

export const bench: Exercise = {
  id: 'bench',
  name: 'Bench Press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
export const press: Exercise = {
  ...bench,
  id: 'press',
  name: 'Overhead Press',
  muscle_group: 'Shoulders',
};
export const row: Exercise = {
  ...bench,
  id: 'row',
  name: 'Rowing Machine',
  category: 'cardio',
  kind: 'cardio',
  muscle_group: 'Cardio',
  equipment: 'machine',
};
export const exercises = [bench, press, row];
export const types = DEFAULT_WORKOUT_TYPES;

export function trackedSet(order: number, values: Partial<TrackedSet>): TrackedSet {
  return {
    id: `set-${order}`,
    order_index: order,
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
    ...values,
  };
}

/** Last week's push day: bench 80 kg × 8, 7 with 2 min rests. */
export const lastPush: TrackedWorkout = {
  id: 'last-push',
  client_session_id: null,
  name: 'Push workout',
  workout_date: '2026-11-15',
  category: 'push',
  notes: null,
  duration_minutes: 50,
  start_time: null,
  end_time: null,
  is_sample: true,
  created_at: '2026-11-15T08:00:00Z',
  updated_at: '2026-11-15T08:00:00Z',
  movements: [
    {
      id: 'm1',
      order_index: 0,
      notes: null,
      exercise: bench,
      machine_photos: [],
      superset_group_id: null,
      superset_name: null,
      sets: [
        trackedSet(0, { reps: 8, weight_kg: 80, rest_seconds: 120 }),
        trackedSet(1, { reps: 7, weight_kg: 80, rest_seconds: 120 }),
      ],
    },
  ],
};

/** Up next: a planned push day of bench, two sets of 8–10. */
export const pushDay: SessionTemplate = {
  category: 'push',
  planned: 'routine',
  sourceWorkout: { ...lastPush, id: 'routine-template', name: 'Push' },
  exercises: [
    {
      exercise: bench,
      repRange: { min: 8, max: 10 },
      topSet: null,
      summary: '2 sets',
      plannedSets: [
        {
          reps: 8,
          weight_kg: null,
          duration_seconds: null,
          distance_km: null,
          rest_seconds: null,
          set_type: 'normal',
        },
        {
          reps: 8,
          weight_kg: null,
          duration_seconds: null,
          distance_km: null,
          rest_seconds: null,
          set_type: 'normal',
        },
      ],
    },
  ],
};

export function keys(prefix = 'key') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

export function context(values: Partial<LoggerContext> = {}): LoggerContext {
  return { workouts: [lastPush], weightUnit: 'kg', defaultRest: 90, newKey: keys(), ...values };
}

export const sessionId = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
/** 9:00 local time on 22 November 2026. */
export const startedAt = new Date(2026, 10, 22, 9, 0).getTime();
