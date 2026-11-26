import { cardioRecordLabel } from './cardioRecords';
import type { PersonalRecord } from './types';
import { shortDate } from './trainingSummary';
import { formatWeight, type WeightUnit } from './weightUnits';
import type { WeeklyCardioReview, WeeklyZoneReview } from './weeklyReview';

// How the weekly review words and marks its figures, shared by the web's popup and the app's.

/** How far back the review steps when the dashboard has no weeks of sets to count. */
export const REVIEW_MAX_WEEKS_AGO = 11;

/** "This week", "Last week" or "3 weeks ago". */
export function reviewWeekName(weeksAgo: number): string {
  return weeksAgo === 0 ? 'This week' : weeksAgo === 1 ? 'Last week' : `${weeksAgo} weeks ago`;
}

/** The furthest week back the review can show, from the dashboard's weeks of sets. */
export function reviewWeeksLimit(muscleWeekCount: number): number {
  return muscleWeekCount ? muscleWeekCount - 1 : REVIEW_MAX_WEEKS_AGO;
}

/** A figure to one decimal place at most, such as "1,240" or "12.5". */
export const reviewNumber = (value: number) => Number(value.toFixed(1)).toLocaleString('en-GB');

export interface ReviewDelta {
  direction: 'up' | 'down' | 'same';
  /** Whether the change is good, bad or neither. */
  tone: 'good' | 'bad' | 'neutral';
  /** "+3", "−1.5 kg" or "±0". */
  text: string;
  /** What a screen reader says: "up 3 on the week before". */
  label: string;
}

/**
 * A change against the week before, or null when the week before isn't known. `better` marks
 * which direction is good, if either is.
 */
export function reviewDelta(
  change: number | null,
  {
    format = reviewNumber,
    unit = '',
    better = 'up',
  }: {
    format?: (value: number) => string;
    unit?: string;
    better?: 'up' | 'down' | null;
  } = {},
): ReviewDelta | null {
  if (change === null) return null;
  const size = Math.abs(change) < 0.05 ? 0 : change;
  const direction = size > 0 ? 'up' : size < 0 ? 'down' : 'same';
  const tone = direction === 'same' || !better ? 'neutral' : direction === better ? 'good' : 'bad';
  const amount = format(Math.abs(size));
  return {
    direction,
    tone,
    text: direction === 'same' ? '±0' : `${direction === 'up' ? '+' : '−'}${amount}${unit}`,
    label:
      direction === 'same'
        ? 'same as the week before'
        : `${direction} ${amount}${unit} on the week before`,
  };
}

const RECORD_LABELS: Partial<Record<PersonalRecord['record_type'], string>> = {
  weight: 'Heaviest weight',
  relative_strength: 'Relative strength PR',
  reps_at_weight: 'Reps at weight',
};

/** A record row's kind ("Reps at weight @ 80 kg"), date and the bodyweight it was set at. */
export function reviewRecordDetail(
  record: PersonalRecord,
  weightUnit: WeightUnit,
): { kind: string; date: string; bodyweight: string | null } {
  const label = cardioRecordLabel(record) ?? RECORD_LABELS[record.record_type] ?? 'PR';
  const weight =
    record.record_type === 'reps_at_weight' && record.weight_kg != null
      ? ` @ ${formatWeight(record.weight_kg, weightUnit)}`
      : '';
  return {
    kind: `${label}${weight}`,
    date: shortDate(record.achieved_date),
    bodyweight:
      record.bodyweight_kg != null
        ? `at ${formatWeight(record.bodyweight_kg, weightUnit)} BW`
        : null,
  };
}

/** The review's line when a week has nothing in it. */
export function reviewEmptyText(isCurrentWeek: boolean): string {
  return isCurrentWeek ? 'Nothing logged yet this week.' : 'Nothing was logged that week.';
}

/** The cardio block's line when it has no zones to show, or null when it has. */
export function cardioReviewEmptyText(cardio: WeeklyCardioReview | null): string | null {
  if (cardio && cardio.zones.length > 0) return null;
  if (!cardio) return 'No cardio data.';
  return cardio.totalMinutes ? 'No zone goals set.' : 'No cardio logged.';
}

/** How much of a zone's goal was met, as a percentage up to 100. */
export function reviewZoneShare(zone: WeeklyZoneReview): number {
  return Math.min(100, (zone.minutes / zone.goalMinutes) * 100) || 0;
}

/** "Week 3 of 8", or "Week 9" past an open-ended or finished plan. */
export function blockProgressText(progress: { week: number; weeks: number | null }): string {
  return progress.weeks === null || progress.week > progress.weeks
    ? `Week ${progress.week}`
    : `Week ${progress.week} of ${progress.weeks}`;
}
