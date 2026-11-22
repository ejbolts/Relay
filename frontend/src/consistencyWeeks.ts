import { daysBetween } from './trainingSummary';

/** The Consistency card's window: training days are counted over the last 12 weeks. */
export const CONSISTENCY_WEEKS = 12;

/**
 * How many weeks "Avg / week" spreads training days over: the weeks since the first workout, at
 * least one and at most the card's twelve, so someone new is not averaged over weeks before they
 * started. Unknown history keeps the full twelve.
 */
export function consistencyWeeks(firstWorkoutDate: string | null | undefined, today: string) {
  if (!firstWorkoutDate) return CONSISTENCY_WEEKS;
  const days = daysBetween(firstWorkoutDate, today) + 1;
  return Math.min(CONSISTENCY_WEEKS, Math.max(1, Math.ceil(days / 7)));
}
