import { isCompletedWorkingSet } from './workoutSets';
import type { Exercise, TrackedWorkout, WorkoutInput, WorkoutSetInput } from './types';

/** What Home shows about the workout just finished, built on the device from what was logged. */
export interface FinishSummary {
  /** The workout's client session, which the saved workout carries once it has synced. */
  sessionId: string | null;
  /** A resumed workout's saved id; it has no client session. Absent from older summaries. */
  workoutId?: string | null;
  finishedAt: number;
  name: string;
  workoutDate: string;
  durationMinutes: number | null;
  sets: number;
  volumeKg: number;
  /** The last session with the same name, for the change in sets and volume. */
  previous: { workoutDate: string; sets: number; volumeKg: number } | null;
  /** Exercises logged on a different machine from their previous session. */
  machineChanges: { exerciseId: string; exerciseName: string }[];
  /** Exercises whose top set has matched the two sessions before it. */
  plateaus: { exerciseId: string; exerciseName: string; weightKg: number; reps: number }[];
}

/** A finished workout stays on Home for the rest of the day, not into the next session. */
export const FINISH_SUMMARY_MAX_AGE_MS = 18 * 60 * 60 * 1000;

/** Milliseconds until the summary is too old to show; below zero once it is. */
export const finishSummaryTimeLeft = (summary: Pick<FinishSummary, 'finishedAt'>, now: number) =>
  summary.finishedAt + FINISH_SUMMARY_MAX_AGE_MS - now;

type SetLike = Pick<
  WorkoutSetInput,
  'reps' | 'weight_kg' | 'completed' | 'set_type' | 'warmup' | 'failed'
>;

const working = (sets: SetLike[]) =>
  sets.filter((item) => isCompletedWorkingSet(item as WorkoutSetInput));

const volumeOf = (sets: SetLike[]) =>
  working(sets).reduce((total, item) => total + (item.weight_kg ?? 0) * (item.reps ?? 0), 0);

/** The heaviest working set, most reps first among equals. */
function topSet(sets: SetLike[]): { weightKg: number; reps: number } | null {
  let best: { weightKg: number; reps: number } | null = null;
  for (const item of working(sets)) {
    if (item.weight_kg == null || item.reps == null || item.weight_kg <= 0) continue;
    if (
      !best ||
      item.weight_kg > best.weightKg ||
      (item.weight_kg === best.weightKg && item.reps > best.reps)
    )
      best = { weightKg: item.weight_kg, reps: item.reps };
  }
  return best;
}

export function buildFinishSummary(
  payload: WorkoutInput,
  exercises: Exercise[],
  workouts: TrackedWorkout[],
  finishedAt: number,
  resumedWorkoutId: string | null = null,
): FinishSummary {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const strength = payload.movements.filter(
    (movement) => byId.get(movement.exercise_id)?.kind !== 'cardio',
  );
  // Everything saved before this workout, newest first; a resumed workout is not its own past.
  const earlier = workouts
    .filter(
      (workout) =>
        workout.id !== resumedWorkoutId &&
        workout.workout_date <= payload.workout_date &&
        (!payload.client_session_id || workout.client_session_id !== payload.client_session_id),
    )
    .sort(
      (left, right) =>
        right.workout_date.localeCompare(left.workout_date) ||
        right.created_at.localeCompare(left.created_at),
    );
  const sessionsOf = (exerciseId: string) =>
    earlier.flatMap((workout) =>
      workout.movements.filter((movement) => movement.exercise.id === exerciseId),
    );

  const sameName = earlier.find(
    (workout) => workout.name.trim().toLowerCase() === payload.name.trim().toLowerCase(),
  );
  const machineChanges: FinishSummary['machineChanges'] = [];
  const plateaus: FinishSummary['plateaus'] = [];
  for (const movement of strength) {
    const exercise = byId.get(movement.exercise_id);
    if (!exercise || !working(movement.sets).length) continue;
    const sessions = sessionsOf(movement.exercise_id);
    const machine = movement.machine_photo_ids.at(-1);
    const lastMachine = sessions
      .find((session) => session.machine_photos.length)
      ?.machine_photos.at(-1)?.id;
    if (machine && lastMachine && machine !== lastMachine)
      machineChanges.push({ exerciseId: exercise.id, exerciseName: exercise.name });
    const top = topSet(movement.sets);
    const before = sessions.slice(0, 2).map((session) => topSet(session.sets));
    if (
      top &&
      before.length === 2 &&
      before.every((item) => item?.weightKg === top.weightKg && item.reps === top.reps)
    )
      plateaus.push({ exerciseId: exercise.id, exerciseName: exercise.name, ...top });
  }

  return {
    sessionId: payload.client_session_id ?? null,
    workoutId: resumedWorkoutId,
    finishedAt,
    name: payload.name,
    workoutDate: payload.workout_date,
    durationMinutes: payload.duration_minutes,
    sets: payload.movements.reduce(
      (total, movement) => total + movement.sets.filter((item) => item.completed).length,
      0,
    ),
    volumeKg: strength.reduce((total, movement) => total + volumeOf(movement.sets), 0),
    previous: sameName
      ? {
          workoutDate: sameName.workout_date,
          // Completed sets on both sides: a set left unticked last time is not work done.
          sets: sameName.movements.reduce(
            (total, movement) => total + movement.sets.filter((item) => item.completed).length,
            0,
          ),
          volumeKg: sameName.movements
            .filter((movement) => movement.exercise.kind !== 'cardio')
            .reduce((total, movement) => total + volumeOf(movement.sets), 0),
        }
      : null,
    machineChanges,
    plateaus,
  };
}

/** Whether the summary is about this workout, saved or still waiting to sync. */
export function finishSummaryIsFor(
  summary: Pick<FinishSummary, 'sessionId' | 'workoutId'>,
  workout: { id: string | null; client_session_id?: string | null },
): boolean {
  return (
    (summary.workoutId != null && summary.workoutId === workout.id) ||
    (summary.sessionId != null && summary.sessionId === workout.client_session_id)
  );
}

/**
 * True once the summary's workout has synced and loaded history no longer has it: it was
 * deleted, here or on another device, or its unsent save was discarded. A summary that cannot
 * name its workout, or whose day is not loaded, is left alone.
 */
export function finishSummaryWorkoutGone(
  summary: Pick<FinishSummary, 'sessionId' | 'workoutId' | 'workoutDate'>,
  workouts: { id: string | null; client_session_id?: string | null }[],
  waiting: { id: string | null; client_session_id?: string | null }[],
  loadedFrom: string,
): boolean {
  if (summary.workoutId == null && summary.sessionId == null) return false;
  if (summary.workoutDate < loadedFrom) return false;
  const isThis = (workout: (typeof workouts)[number]) => finishSummaryIsFor(summary, workout);
  return !waiting.some(isThis) && !workouts.some(isThis);
}

const storageKey = (userId: string) => `relay:finished-workout:v1:${encodeURIComponent(userId)}`;

function isSummary(value: unknown): value is FinishSummary {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<FinishSummary>;
  return (
    typeof item.finishedAt === 'number' &&
    typeof item.name === 'string' &&
    typeof item.workoutDate === 'string' &&
    typeof item.sets === 'number' &&
    typeof item.volumeKg === 'number' &&
    Array.isArray(item.machineChanges) &&
    Array.isArray(item.plateaus)
  );
}

export function readFinishSummary(userId: string, now: number): FinishSummary | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? 'null');
    if (!isSummary(value) || finishSummaryTimeLeft(value, now) < 0) return null;
    return value;
  } catch {
    return null;
  }
}

export function writeFinishSummary(userId: string, summary: FinishSummary | null) {
  try {
    if (summary) window.localStorage.setItem(storageKey(userId), JSON.stringify(summary));
    else window.localStorage.removeItem(storageKey(userId));
  } catch {
    /* The card still shows for this visit when storage is unavailable. */
  }
}
