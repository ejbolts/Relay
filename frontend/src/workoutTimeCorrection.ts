import { MAX_LIVE_CLOCK_SECONDS } from './workoutPause';

/**
 * The live clock's correction fields, shared by the web's WorkoutTimeEditor and the app: the
 * training time so far in whole hours and minutes, and the seconds they add up to.
 */

function wholeNumber(value: string, max: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(0, parsed)) : 0;
}

/** The hours and minutes the correction starts from, for a clock reading `elapsedSeconds`. */
export function workoutTimeFields(elapsedSeconds: number): { hours: string; minutes: string } {
  const startingMinutes = Math.floor(Math.min(elapsedSeconds, MAX_LIVE_CLOCK_SECONDS) / 60);
  return {
    hours: String(Math.floor(startingMinutes / 60)),
    minutes: String(startingMinutes % 60),
  };
}

/**
 * The corrected training time so far, in seconds. Each field is read as a whole number (up to
 * 23 hours and 59 minutes); anything else counts as 0.
 */
export function workoutTimeSeconds(hours: string, minutes: string): number {
  return Math.min(
    MAX_LIVE_CLOCK_SECONDS,
    wholeNumber(hours, 23) * 3600 + wholeNumber(minutes, 59) * 60,
  );
}
