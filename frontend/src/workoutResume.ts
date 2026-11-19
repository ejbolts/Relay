import type { Exercise, TrackedWorkout, WorkoutSetInput } from './types';
import { localDateOf, workoutDurationMinutes } from './utils';

/** Only logged cardio contributes; suggested and unticked sets remain planned time. */
export function completedCardioDurationSeconds(
  movements: { exercise: Pick<Exercise, 'kind'>; sets: WorkoutSetInput[] }[],
): number {
  return movements.reduce(
    (total, movement) =>
      total +
      (movement.exercise.kind === 'cardio'
        ? movement.sets.reduce(
            (seconds, item) => seconds + (item.completed ? (item.duration_seconds ?? 0) : 0),
            0,
          )
        : 0),
    0,
  );
}

/** Keep a saved workout's time range consistent when its logged cardio runs longer. */
export function cardioAdjustedEndTime(start: string, end: string, cardioSeconds: number): string {
  const duration = workoutDurationMinutes(start, end);
  const cardioMinutes = Math.ceil(cardioSeconds / 60);
  if (duration === null || duration >= cardioMinutes) return end;
  const [hours, minutes] = start.split(':').map(Number);
  const endMinutes = (hours * 60 + minutes + cardioMinutes) % 1440;
  return `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
}

export function completedWorkoutDurationMinutes(
  previousDurationMinutes: number,
  startedAt: number,
  endedAt: number,
  overrideMinutes: number | null,
  pausedMs = 0,
  cardioSeconds = 0,
): number {
  const elapsedSeconds = Math.max(0, Math.floor((endedAt - startedAt - pausedMs) / 1000));
  return Math.max(
    1,
    Math.ceil(cardioSeconds / 60),
    overrideMinutes ?? previousDurationMinutes + Math.round(elapsedSeconds / 60),
  );
}

/** How long after midnight a late session can still be resumed. */
export const RESUME_LATE_WORKOUT_MS = 6 * 60 * 60 * 1000;

/**
 * Resume continues a session, so it is offered for workouts from today, and for a few hours
 * after a late one that ran past midnight. Older workouts are changed with Edit instead.
 */
export function canResumeWorkout(
  workout: Pick<TrackedWorkout, 'workout_date' | 'created_at' | 'updated_at'>,
  now = Date.now(),
): boolean {
  const today = localDateOf(new Date(now).toISOString());
  if (workout.workout_date === today) return true;
  const savedAt = Math.max(Date.parse(workout.created_at), Date.parse(workout.updated_at) || 0);
  return (
    workout.workout_date === localDateOf(new Date(now - RESUME_LATE_WORKOUT_MS).toISOString()) &&
    Number.isFinite(savedAt) &&
    now - savedAt <= RESUME_LATE_WORKOUT_MS
  );
}
