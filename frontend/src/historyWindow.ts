import type { HeatmapDay, TrackedWorkout, WorkoutHistorySummary } from './types';

/**
 * Long training logs load recent months first. Startup reads this many calendar months, including
 * the current one; scrolling back through the calendar or paging back through Sessions reads older chunks.
 */
export const INITIAL_HISTORY_MONTHS = 3;
export const OLDER_HISTORY_MONTHS = 6;

function isoDate(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

/** The first day of the month `months - 1` months before `today`'s month. */
export function initialHistoryStart(today: Date = new Date()): string {
  return isoDate(today.getFullYear(), today.getMonth() - (INITIAL_HISTORY_MONTHS - 1), 1);
}

export function hasOlderHistory(
  historyStart: string,
  summary: WorkoutHistorySummary | null | undefined,
): boolean {
  const first = summary?.first_workout_date;
  return first != null && first < historyStart;
}

/** The next window before `historyStart`: whole months ending the day before it. */
export function olderHistoryWindow(historyStart: string): { start: string; end: string } {
  const [year, month] = historyStart.split('-').map(Number);
  return {
    start: isoDate(year, month - 1 - OLDER_HISTORY_MONTHS, 1),
    end: isoDate(year, month - 1, 0),
  };
}

/** Appends older workouts after the loaded ones, newest first, without duplicates. */
export function appendOlderWorkouts(
  loaded: TrackedWorkout[],
  older: TrackedWorkout[],
): TrackedWorkout[] {
  const ids = new Set(loaded.map((workout) => workout.id));
  return [...loaded, ...older.filter((workout) => !ids.has(workout.id))];
}

/** Prepends older calendar days, oldest first, without duplicating a loaded day. */
export function prependOlderDays(loaded: HeatmapDay[], older: HeatmapDay[]): HeatmapDay[] {
  const dates = new Set(loaded.map((day) => day.workout_date));
  return [...older.filter((day) => !dates.has(day.workout_date)), ...loaded];
}

/**
 * A refresh re-reads the window that was loaded when it started. Anything older that was loaded
 * meanwhile (from `windowStart` back to `historyStart`) is kept, so a slow refresh cannot drop it.
 */
export function keepLoadedBefore<T extends { workout_date: string }>(
  current: T[],
  refreshedFrom: string,
  historyStart: string,
): T[] {
  return current.filter(
    (item) => item.workout_date >= historyStart && item.workout_date < refreshedFrom,
  );
}
