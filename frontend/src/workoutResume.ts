import type { Exercise, WorkoutSetInput } from './types';
import { workoutDurationMinutes } from './utils';

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
