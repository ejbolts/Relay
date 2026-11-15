import type {
  RoutineDay,
  RoutineMovement,
  TrackedWorkout,
  WorkoutCategory,
  WorkoutType,
} from './types';
import type { SessionTemplate } from './trainingSummary';
import { createWorkoutSet } from './workoutSets';
import { formatWeight, type WeightUnit } from './weightUnits';

export function routineSessionTemplate(
  day: RoutineDay,
  name: string,
  date: string,
  unit: WeightUnit,
): SessionTemplate {
  return plannedSessionTemplate(day.workout_type!, day.movements, name, date, unit, 'routine');
}

/** Pre-fills a workout from the exercises saved to its workout type. */
export function typeSessionTemplate(
  type: WorkoutType,
  movements: RoutineMovement[],
  name: string,
  date: string,
  unit: WeightUnit,
): SessionTemplate {
  return plannedSessionTemplate(type, movements, name, date, unit, 'type');
}

function plannedSessionTemplate(
  type: WorkoutType,
  movements: RoutineMovement[],
  name: string,
  date: string,
  unit: WeightUnit,
  planned: NonNullable<SessionTemplate['planned']>,
): SessionTemplate {
  const category = (type.is_custom ? 'other' : type.id) as WorkoutCategory;
  const sourceWorkout: TrackedWorkout = {
    id: 'routine-template',
    name,
    workout_date: date,
    category,
    workout_type_id: type.is_custom ? type.id : null,
    workout_type: type,
    notes: null,
    duration_minutes: null,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: `${date}T00:00:00Z`,
    updated_at: `${date}T00:00:00Z`,
    movements: [],
  };
  return {
    category,
    sourceWorkout,
    planned,
    exercises: movements.map(({ exercise, sets, rep_range }) => ({
      exercise,
      plannedSets: sets,
      ...(rep_range && exercise.kind !== 'cardio' && { repRange: rep_range }),
      topSet: sets[0]
        ? {
            ...createWorkoutSet(exercise.kind),
            ...sets[0],
            id: 'planned',
            order_index: 0,
            incline_percent: null,
            speed_kph: null,
            bodyweight_kg: null,
            percentile: null,
            warmup: sets[0].set_type === 'warmup',
            completed: false,
            failed: false,
            target_reps: null,
          }
        : null,
      summary:
        sets[0]?.weight_kg != null
          ? `${formatWeight(sets[0].weight_kg, unit)} × ${sets[0].reps ?? '–'}`
          : `${sets.length} sets`,
    })),
  };
}
