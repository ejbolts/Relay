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

/**
 * A finished live workout's clock times: its real start, and the end its saved duration reaches.
 * The server derives the duration from the two times, so this keeps it equal to the logged
 * duration (paused time left out). None for a full day, whose times would read as zero.
 */
export function liveWorkoutTimes(
  startedAt: number,
  durationMinutes: number,
): { start: string; end: string } | null {
  if (durationMinutes <= 0 || durationMinutes >= 1440) return null;
  const started = new Date(startedAt);
  const startMinutes = started.getHours() * 60 + started.getMinutes();
  const clock = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return { start: clock(startMinutes), end: clock((startMinutes + durationMinutes) % 1440) };
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
