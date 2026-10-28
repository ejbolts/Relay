import type { RoutineDay, TrackedWorkout, WorkoutCategory } from './types';
import type { SessionTemplate } from './trainingSummary';
import { createWorkoutSet } from './workoutSets';
import { formatWeight, type WeightUnit } from './weightUnits';

export function routineSessionTemplate(
  day: RoutineDay,
  name: string,
  date: string,
  unit: WeightUnit,
): SessionTemplate {
  const type = day.workout_type!;
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
    exercises: day.movements.map(({ exercise, sets }) => ({
      exercise,
      plannedSets: sets,
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
