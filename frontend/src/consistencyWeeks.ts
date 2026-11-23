import { daysBetween } from './trainingSummary';
import type { HeatmapDay } from './types';

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

/** The earliest training day in a full heatmap: the member's first workout. */
export function firstTrainingDay(heatmap: HeatmapDay[]): string | undefined {
  return heatmap
    .filter((day) => day.workout_count > 0)
    .reduce<string | undefined>(
      (first, day) => (!first || day.workout_date < first ? day.workout_date : first),
      undefined,
    );
}

/** "Avg / week": training days spread over the card's weeks, to one decimal. */
export function averagePerWeek(trainingDays: number, weeks: number): string {
  return (trainingDays / weeks).toFixed(1);
}
