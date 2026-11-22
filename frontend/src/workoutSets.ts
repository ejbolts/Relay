import { setKindOf } from './setFieldValues';
import type { ExerciseKind, TrackedSet, TrackedWorkout, WorkoutSetInput } from './types';

/** `defaultRest` is the user's default rest, for a strength set with no rest to copy. */
export function createWorkoutSet(
  kind: ExerciseKind,
  previous?: WorkoutSetInput,
  isFirstSet = previous === undefined,
  defaultRest: number | null = null,
): WorkoutSetInput {
  const setType = isFirstSet
    ? 'warmup'
    : (previous?.set_type ?? (previous?.warmup ? 'warmup' : 'normal'));

  return {
    reps: kind === 'strength' ? (previous?.reps ?? null) : null,
    weight_kg: kind === 'strength' ? (previous?.weight_kg ?? null) : null,
    // Effort is logged only when picked; last time's RPE is shown as a hint instead.
    rpe: null,
    rest_seconds: kind === 'strength' ? (previous?.rest_seconds ?? defaultRest) : null,
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

/**
 * The logged sets of the exercise's latest session with working sets, to suggest and progress
 * from. A session cut short to warm-ups says nothing about working weights and is skipped. When
 * the latest session logged fewer working sets than the one before it, its last working set is
 * repeated up to that count, so one short day does not shrink the next workout.
 */
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
  const sessions: TrackedSet[][] = [];

  for (const workout of newestFirst) {
    if (workout.id === excludedWorkoutId || workout.workout_date > onOrBeforeDate) continue;
    const movement = workout.movements.find((item) => item.exercise.id === exerciseId);
    const completedSets = movement?.sets
      .filter((item) => item.completed)
      .sort((left, right) => left.order_index - right.order_index);
    if (!completedSets?.some(isLoggedWorkingSet)) continue;
    sessions.push(completedSets);
    if (sessions.length === 2) break;
  }

  const [latest, before] = sessions;
  if (!latest) return [];
  const working = latest.filter(isLoggedWorkingSet);
  const missing = (before?.filter(isLoggedWorkingSet).length ?? 0) - working.length;
  if (missing <= 0) return latest;
  const last = working[working.length - 1];
  const lastIndex = latest.lastIndexOf(last);
  const repeats = Array.from({ length: missing }, (_, offset) => ({
    ...last,
    id: `${last.id}-repeat-${offset + 1}`,
    notes: null,
  }));
  return [...latest.slice(0, lastIndex + 1), ...repeats, ...latest.slice(lastIndex + 1)];
}

/** A ticked set that counts as training, rather than a warm-up. */
export function isLoggedWorkingSet(
  item: Pick<WorkoutSetInput, 'completed' | 'set_type' | 'warmup'>,
): boolean {
  return item.completed && item.set_type !== 'warmup' && !item.warmup;
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

/**
 * Whether a set has something to log: reps for strength (weight is optional for bodyweight
 * lifts), or any measurement for cardio. Bodyweight and percentile are attached automatically,
 * so they do not count as an entry.
 */
export function hasRecordedPerformance(
  kind: ExerciseKind,
  item: Pick<
    WorkoutSetInput,
    | 'reps'
    | 'duration_seconds'
    | 'distance_km'
    | 'calories_kcal'
    | 'average_heart_rate_bpm'
    | 'incline_percent'
    | 'speed_kph'
  >,
): boolean {
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
  return item.reps != null;
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
