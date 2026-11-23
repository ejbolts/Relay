export const MAX_INACTIVE_WORKOUT_MS = 3 * 60 * 60 * 1000;
export const RECENT_WORKOUT_ACTIVITY_MS = 30 * 60 * 1000;

// The signed-in account's auto-save time replaces the three-hour cutoff while it is on.
let inactiveWorkoutLimitMs = MAX_INACTIVE_WORKOUT_MS;

export function setInactiveWorkoutLimitMinutes(minutes: number | null): void {
  inactiveWorkoutLimitMs = minutes ? minutes * 60 * 1000 : MAX_INACTIVE_WORKOUT_MS;
}

export function inactiveWorkoutFinishAt(
  startedAt: number,
  lastActiveAt: number,
  limitMs = inactiveWorkoutLimitMs,
): number {
  return Math.max(startedAt + limitMs, lastActiveAt + RECENT_WORKOUT_ACTIVITY_MS);
}

/**
 * When a workout left running is saved as ending: its last activity, such as the last set
 * logged, rather than the cutoff that noticed it was left, and never after that cutoff.
 */
export function inactiveWorkoutEndAt(
  startedAt: number,
  lastActiveAt: number,
  finishAt: number,
): number {
  return Math.min(finishAt, Math.max(startedAt, lastActiveAt));
}

export function shouldAutoFinishWorkout(
  startedAt: number,
  lastActiveAt: number,
  now = Date.now(),
): boolean {
  return now >= inactiveWorkoutFinishAt(startedAt, lastActiveAt);
}

export function extendInactiveWorkoutFinishAt(currentFinishAt: number, activityAt: number): number {
  if (activityAt >= currentFinishAt) return currentFinishAt;
  return Math.max(currentFinishAt, activityAt + RECENT_WORKOUT_ACTIVITY_MS);
}

function startedLabel(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * When a workout left running started and ended, as its prompt says them: the end time alone on
 * the day it started, or with its own day after midnight.
 */
export function inactiveWorkoutTimes(startedAt: number, endedAt: number) {
  return {
    started: startedLabel(startedAt),
    ended:
      new Date(endedAt).toDateString() !== new Date(startedAt).toDateString()
        ? startedLabel(endedAt)
        : new Date(endedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  };
}
