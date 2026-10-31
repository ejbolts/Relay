/**
 * Paused time in a live workout. The session keeps its real start, so start times, the draft's
 * identity and inactivity limits are unchanged; paused time is only left out of the live clock
 * and the saved duration.
 */
export interface WorkoutPause {
  /** Paused time from earlier pauses that have already been resumed. */
  pausedMs: number;
  /** When the current pause began, or null while the workout is running. */
  pausedAt: number | null;
}

export const RUNNING: WorkoutPause = { pausedMs: 0, pausedAt: null };

/** All paused time up to `now`, including a pause that is still going. */
export function pausedMsAt(pause: WorkoutPause, now = Date.now()): number {
  return pause.pausedMs + (pause.pausedAt === null ? 0 : Math.max(0, now - pause.pausedAt));
}

/** Seconds of training since `startedAt`, leaving out paused time. */
export function activeElapsedSeconds(
  startedAt: number,
  pause: WorkoutPause,
  now = Date.now(),
): number {
  return Math.max(0, Math.floor((now - startedAt - pausedMsAt(pause, now)) / 1000));
}

export function pauseWorkout(pause: WorkoutPause, now = Date.now()): WorkoutPause {
  return pause.pausedAt === null ? { pausedMs: pause.pausedMs, pausedAt: now } : pause;
}

export function resumeWorkout(pause: WorkoutPause, now = Date.now()): WorkoutPause {
  return pause.pausedAt === null ? pause : { pausedMs: pausedMsAt(pause, now), pausedAt: null };
}

/** The pause stored with a draft; drafts saved before pausing existed are running. */
export function draftPause(draft: { pausedMs?: number; pausedAt?: number | null } | null) {
  if (!draft) return RUNNING;
  return { pausedMs: draft.pausedMs ?? 0, pausedAt: draft.pausedAt ?? null };
}

export function validStoredPause(pausedMs: unknown, pausedAt: unknown): boolean {
  return (
    (pausedMs === undefined ||
      (typeof pausedMs === 'number' && Number.isFinite(pausedMs) && pausedMs >= 0)) &&
    (pausedAt === undefined ||
      pausedAt === null ||
      (typeof pausedAt === 'number' && Number.isFinite(pausedAt) && pausedAt > 0))
  );
}
