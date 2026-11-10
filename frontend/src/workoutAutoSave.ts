import type { ExerciseKind, WorkoutSetInput } from './types';

type DraftSetForAutoSave = WorkoutSetInput & { fromPrevious?: boolean };

/** Editing rest, notes or set type does not turn copied performance into a performed set. */
export function workoutSetAfterEdit<T extends DraftSetForAutoSave>(set: T, update: Partial<T>): T {
  const performanceFields: (keyof WorkoutSetInput)[] = [
    'completed',
    'reps',
    'weight_kg',
    'bodyweight_kg',
    'percentile',
    'duration_seconds',
    'distance_km',
    'calories_kcal',
    'average_heart_rate_bpm',
    'incline_percent',
    'speed_kph',
  ];
  const enteredPerformance = performanceFields.some((field) => update[field] !== undefined);
  return { ...set, ...update, ...(enteredPerformance && { fromPrevious: false }) };
}

export function isWorkoutSetAutoSavable(kind: ExerciseKind, set: DraftSetForAutoSave): boolean {
  if (set.completed) return true;
  // Values copied from history are a plan until the user logs or edits the set.
  if (set.fromPrevious) return false;

  if (kind === 'cardio') {
    return (
      set.duration_seconds != null ||
      set.distance_km != null ||
      set.calories_kcal != null ||
      set.average_heart_rate_bpm != null ||
      set.incline_percent != null ||
      set.speed_kph != null
    );
  }

  return (
    set.reps != null || set.weight_kg != null || set.bodyweight_kg != null || set.percentile != null
  );
}

/** Whether a set was logged, for stored drafts whose exercise kind cannot be resolved. */
export function isStoredSetLogged(set: DraftSetForAutoSave): boolean {
  return isWorkoutSetAutoSavable('strength', set) || isWorkoutSetAutoSavable('cardio', set);
}

export function workoutSetForAutoSave(
  kind: ExerciseKind,
  set: DraftSetForAutoSave,
): DraftSetForAutoSave {
  return isWorkoutSetAutoSavable(kind, set) ? { ...set, completed: true } : set;
}
