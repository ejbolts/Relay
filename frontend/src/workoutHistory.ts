import { addDays, daysBetween, weekStartFor } from './trainingSummary';

export function workoutPageForId(
  workouts: ReadonlyArray<{ id: string }>,
  workoutId: string | null,
  pageSize: number,
): number | null {
  if (workoutId === null) return null;
  const index = workouts.findIndex((workout) => workout.id === workoutId);
  return index < 0 ? null : Math.floor(index / pageSize) + 1;
}

export function upsertWorkoutByRecency<
  T extends { id: string; workout_date: string; created_at: string },
>(workouts: ReadonlyArray<T>, saved: T): T[] {
  return [saved, ...workouts.filter((workout) => workout.id !== saved.id)].sort(
    (left, right) =>
      right.workout_date.localeCompare(left.workout_date) ||
      right.created_at.localeCompare(left.created_at),
  );
}
/** Sessions shows two calendar weeks per page. */
export const HISTORY_WEEKS_PER_PAGE = 2;

/**
 * The day Sessions pages count back from: today, or the latest workout when training has paused,
 * so page 1 is normally this week and last week but never opens empty after a break.
 */
export function historyPageAnchor(today: string, latestWorkoutDate: string | null | undefined) {
  return latestWorkoutDate && latestWorkoutDate < today ? latestWorkoutDate : today;
}

/**
 * The dates a Sessions page covers. Page 1 has no upper bound, so a workout dated after the
 * anchor still appears with the latest weeks.
 */
export function historyPageWindow(
  anchor: string,
  weekStartDay: number,
  page: number,
): { start: string; end: string | null } {
  const span = HISTORY_WEEKS_PER_PAGE * 7;
  const start = addDays(weekStartFor(anchor, weekStartDay), -7 - span * (Math.max(1, page) - 1));
  return { start, end: page <= 1 ? null : addDays(start, span - 1) };
}

/** The page whose window holds `date`; dates after the anchor are on page 1. */
export function historyPageForDate(date: string, anchor: string, weekStartDay: number): number {
  const weeksBack = Math.round(
    daysBetween(weekStartFor(date, weekStartDay), weekStartFor(anchor, weekStartDay)) / 7,
  );
  return Math.max(1, Math.floor(weeksBack / HISTORY_WEEKS_PER_PAGE) + 1);
}

/** Pages needed to reach the oldest workout, including older history that has not loaded yet. */
export function historyPageCount(
  oldestDate: string | null | undefined,
  anchor: string,
  weekStartDay: number,
): number {
  return oldestDate ? historyPageForDate(oldestDate, anchor, weekStartDay) : 1;
}
