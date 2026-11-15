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
  /**
   * Time a manual correction added to the live clock, for a timer started late; negative when
   * the correction took time off. Like a pause, it leaves the session's real start alone.
   */
  adjustedMs?: number;
}

export const RUNNING: WorkoutPause = { pausedMs: 0, pausedAt: null };

/** The longest training time the live clock can be corrected to. */
export const MAX_LIVE_CLOCK_SECONDS = 24 * 60 * 60 - 60;

/** All paused time up to `now`, including a pause that is still going. */
export function pausedMsAt(pause: WorkoutPause, now = Date.now()): number {
  return pause.pausedMs + (pause.pausedAt === null ? 0 : Math.max(0, now - pause.pausedAt));
}

/**
 * What the live clock leaves out of the time since the session started: paused time, less any
 * time a manual correction added. Negative when the correction added more than was paused.
 */
export function clockOffsetMsAt(pause: WorkoutPause, now = Date.now()): number {
  return pausedMsAt(pause, now) - (pause.adjustedMs ?? 0);
}

/** Seconds of training since `startedAt`, leaving out paused time and applying corrections. */
export function activeElapsedSeconds(
  startedAt: number,
  pause: WorkoutPause,
  now = Date.now(),
): number {
  return Math.max(0, Math.floor((now - startedAt - clockOffsetMsAt(pause, now)) / 1000));
}

/**
 * Corrects the live clock so it reads `seconds` now and keeps counting from there. Pauses, past
 * and current, are kept as they are.
 */
export function withElapsedSeconds(
  pause: WorkoutPause,
  startedAt: number,
  seconds: number,
  now = Date.now(),
): WorkoutPause {
  const target = Math.min(MAX_LIVE_CLOCK_SECONDS, Math.max(0, Math.floor(seconds))) * 1000;
  return { ...pause, adjustedMs: target - (now - startedAt - pausedMsAt(pause, now)) };
}

export function pauseWorkout(pause: WorkoutPause, now = Date.now()): WorkoutPause {
  return pause.pausedAt === null ? { ...pause, pausedAt: now } : pause;
}

export function resumeWorkout(pause: WorkoutPause, now = Date.now()): WorkoutPause {
  return pause.pausedAt === null
    ? pause
    : { ...pause, pausedMs: pausedMsAt(pause, now), pausedAt: null };
}

/** The pause stored with a draft; drafts saved before pausing existed are running. */
export function draftPause(
  draft: { pausedMs?: number; pausedAt?: number | null; adjustedMs?: number } | null,
): WorkoutPause {
  if (!draft) return RUNNING;
  return {
    pausedMs: draft.pausedMs ?? 0,
    pausedAt: draft.pausedAt ?? null,
    ...(draft.adjustedMs !== undefined && { adjustedMs: draft.adjustedMs }),
  };
}

export function validStoredPause(
  pausedMs: unknown,
  pausedAt: unknown,
  adjustedMs?: unknown,
): boolean {
  return (
    (pausedMs === undefined ||
      (typeof pausedMs === 'number' && Number.isFinite(pausedMs) && pausedMs >= 0)) &&
    (pausedAt === undefined ||
      pausedAt === null ||
      (typeof pausedAt === 'number' && Number.isFinite(pausedAt) && pausedAt > 0)) &&
    (adjustedMs === undefined || (typeof adjustedMs === 'number' && Number.isFinite(adjustedMs)))
  );
}
