import { setKindOf } from './setFieldValues';
import type { ExerciseKind, TrackedSet, TrackedWorkout, WorkoutSetInput } from './types';

export const DEFAULT_REST_SECONDS = 180;

export function createWorkoutSet(
  kind: ExerciseKind,
  previous?: WorkoutSetInput,
  isFirstSet = previous === undefined,
): WorkoutSetInput {
  const setType = isFirstSet
    ? 'warmup'
    : (previous?.set_type ?? (previous?.warmup ? 'warmup' : 'normal'));

  return {
    reps: kind === 'strength' ? (previous?.reps ?? null) : null,
    weight_kg: kind === 'strength' ? (previous?.weight_kg ?? null) : null,
    rpe: previous?.rpe ?? null,
    rest_seconds: kind === 'strength' ? (previous?.rest_seconds ?? DEFAULT_REST_SECONDS) : null,
    duration_seconds: kind === 'cardio' ? (previous?.duration_seconds ?? null) : null,
    distance_km: kind === 'cardio' ? (previous?.distance_km ?? null) : null,
    calories_kcal: kind === 'cardio' ? (previous?.calories_kcal ?? null) : null,
    average_heart_rate_bpm: kind === 'cardio' ? (previous?.average_heart_rate_bpm ?? null) : null,
    incline_percent: kind === 'cardio' ? (previous?.incline_percent ?? null) : null,
    speed_kph: kind === 'cardio' ? (previous?.speed_kph ?? null) : null,
    notes: null,
    set_type: setType,
    failed: false,
    target_reps: previous?.target_reps ?? null,
    warmup: setType === 'warmup',
    completed: false,
  };
}

export function createSuggestedWorkoutSet(
  kind: ExerciseKind,
  previous: WorkoutSetInput,
): WorkoutSetInput {
  return {
    ...createWorkoutSet(kind, previous, false),
    rest_seconds: kind === 'strength' ? previous.rest_seconds : null,
  };
}

const isWorkingKind = (item: WorkoutSetInput) => ['normal', 'failure'].includes(setKindOf(item));

/**
 * After a working set is logged, the next set takes its weight and reps while it is still an
 * untouched suggestion from the last workout, so it suggests repeating what was just lifted.
 */
export function suggestNextSetFromLoggedSet<T extends WorkoutSetInput & { fromPrevious?: boolean }>(
  kind: ExerciseKind,
  sets: T[],
  loggedIndex: number,
): T[] {
  const logged = sets[loggedIndex];
  const next = sets[loggedIndex + 1];
  if (kind !== 'strength' || !logged?.completed || !next?.fromPrevious || next.completed) {
    return sets;
  }
  if (!isWorkingKind(logged) || !isWorkingKind(next)) return sets;
  if (next.machine_photo_id !== logged.machine_photo_id) return sets;
  if (next.weight_kg === logged.weight_kg && next.reps === logged.reps) return sets;

  return sets.map((item, index) =>
    index === loggedIndex + 1 ? { ...item, weight_kg: logged.weight_kg, reps: logged.reps } : item,
  );
}

export function latestExerciseSet(
  workouts: TrackedWorkout[],
  exerciseId: string,
  onOrBeforeDate: string,
  excludedWorkoutId?: string,
): TrackedSet | undefined {
  return latestExerciseSets(workouts, exerciseId, onOrBeforeDate, excludedWorkoutId)[0];
}

export function latestExerciseSets(
  workouts: TrackedWorkout[],
  exerciseId: string,
  onOrBeforeDate: string,
  excludedWorkoutId?: string,
): TrackedSet[] {
  const newestFirst = [...workouts].sort(
    (left, right) =>
      right.workout_date.localeCompare(left.workout_date) ||
      right.created_at.localeCompare(left.created_at),
  );

  for (const workout of newestFirst) {
    if (workout.id === excludedWorkoutId || workout.workout_date > onOrBeforeDate) continue;
    const movement = workout.movements.find((item) => item.exercise.id === exerciseId);
    const completedSets = movement?.sets
      .filter((item) => item.completed)
      .sort((left, right) => left.order_index - right.order_index);
    if (completedSets?.length) return completedSets;
  }

  return [];
}

export function isCompletedWorkingSet(item: WorkoutSetInput): boolean {
  return (
    item.completed &&
    item.set_type !== 'warmup' &&
    !item.warmup &&
    (!item.failed || (item.reps ?? 0) > 0)
  );
}

export function restTimerSecondsAfterSetUpdate(
  kind: ExerciseKind,
  current: Pick<WorkoutSetInput, 'completed' | 'rest_seconds'>,
  update: Partial<Pick<WorkoutSetInput, 'completed' | 'rest_seconds'>>,
): number | null {
  if (kind === 'cardio' || current.completed || update.completed !== true) return null;

  const seconds = update.rest_seconds !== undefined ? update.rest_seconds : current.rest_seconds;
  return seconds !== null && seconds > 0 ? seconds : null;
}

function hasRecordedPerformance(kind: ExerciseKind, item: WorkoutSetInput): boolean {
  if (kind === 'cardio') {
    return [
      item.duration_seconds,
      item.distance_km,
      item.calories_kcal,
      item.average_heart_rate_bpm,
      item.incline_percent,
      item.speed_kph,
    ].some((value) => value != null);
  }
  return [item.reps, item.weight_kg, item.bodyweight_kg, item.percentile].some(
    (value) => value != null,
  );
}

/**
 * Finishing an exercise logs its remaining sets as shown, including suggestions from the last
 * workout. Blank sets stay unticked so no empty set is recorded.
 */
export function completeRemainingSets<T extends WorkoutSetInput & { fromPrevious?: boolean }>(
  kind: ExerciseKind,
  sets: T[],
): T[] {
  return sets.map((item) =>
    item.completed || !hasRecordedPerformance(kind, item)
      ? item
      : { ...item, completed: true, fromPrevious: false },
  );
}
