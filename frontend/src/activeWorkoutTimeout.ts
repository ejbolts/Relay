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
