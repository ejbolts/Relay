import { bodyGoalKind } from './bodyMeasurementHistory';
import { isAllTimeRecord } from './recordScope';
import { blockOn } from './trainingBlocks';
import { daysBetween, weekStartFor } from './trainingSummary';
import type { BodyWeightGoal, PersonalRecord, TrackedWorkout, TrainingBlock } from './types';

/** Why now is a natural moment to start a training block. */
export type BlockSuggestion =
  | { reason: 'returning'; days: number }
  | { reason: 'new-goal' }
  | { reason: 'stalled'; weeks: number }
  | { reason: 'no-block'; weeks: number };

/** Weeks of training before the first block is worth offering at all. */
export const WEEKS_BEFORE_FIRST_BLOCK = 4;
/** This many days without training, just ended, reads as the start of something new. */
const RETURN_DAYS_OFF = 10;
/** How recent the return, or the new goal, must be to still be the moment. */
const RECENT_DAYS = 14;
/** A block this young is the new phase; nothing more is suggested on top of it. */
const NEW_BLOCK_DAYS = 21;
const STALL_DAYS = 21;

const real = (workouts: TrackedWorkout[]) => workouts.filter((workout) => !workout.is_sample);

/**
 * How many different weeks hold at least one of the person's own workouts. Weeks start on
 * `weekStartDay` (Date#getDay numbering), so they match the weeks the rest of the app shows.
 */
export function trainedWeeks(workouts: TrackedWorkout[], weekStartDay = 1): number {
  return new Set(real(workouts).map((workout) => weekStartFor(workout.workout_date, weekStartDay)))
    .size;
}

/** The day the weight goal last changed direction (losing, gaining, maintaining), if it has. */
export function goalDirectionChangedOn(goals: BodyWeightGoal[]): string | null {
  const ordered = [...goals].sort((left, right) => left.created_at.localeCompare(right.created_at));
  const latest = ordered.at(-1);
  const before = ordered.at(-2);
  if (!latest || !before || bodyGoalKind(latest) === bodyGoalKind(before)) return null;
  return latest.created_at.slice(0, 10);
}

/**
 * The reason to suggest a new block today, strongest first, or null when there is none. A block
 * started in the last three weeks is already the new phase, so nothing is suggested then.
 */
export function blockSuggestion({
  workouts,
  records,
  blocks,
  today,
  goalChangedOn = null,
  weekStartDay = 1,
}: {
  workouts: TrackedWorkout[];
  records: PersonalRecord[];
  blocks: TrainingBlock[];
  today: string;
  goalChangedOn?: string | null;
  weekStartDay?: number;
}): BlockSuggestion | null {
  const current = blockOn(blocks, today);
  if (current && daysBetween(current.start_date, today) < NEW_BLOCK_DAYS) return null;

  const dates = [...new Set(real(workouts).map((workout) => workout.workout_date))]
    .filter((date) => date <= today)
    .sort();
  // Back from a break: the latest run of days off between two training days, when the return
  // is recent. Training on the 1st and the 12th leaves ten days off between them.
  for (let index = dates.length - 1; index > 0; index -= 1) {
    if (daysBetween(dates[index], today) > RECENT_DAYS) break;
    const daysOff = daysBetween(dates[index - 1], dates[index]) - 1;
    if (daysOff >= RETURN_DAYS_OFF) return { reason: 'returning', days: daysOff };
  }

  if (goalChangedOn && goalChangedOn <= today && daysBetween(goalChangedOn, today) <= RECENT_DAYS)
    return { reason: 'new-goal' };

  // Still training, but the records have dried up after a spell that had plenty.
  const daysAgo = (date: string) => daysBetween(date, today);
  const allTime = records.filter(isAllTimeRecord);
  const recent = allTime.filter(
    (record) => daysAgo(record.achieved_date) >= 0 && daysAgo(record.achieved_date) < STALL_DAYS,
  );
  const earlier = allTime.filter(
    (record) =>
      daysAgo(record.achieved_date) >= STALL_DAYS && daysAgo(record.achieved_date) < STALL_DAYS * 2,
  );
  const sessions = dates.filter((date) => daysAgo(date) < STALL_DAYS).length;
  if (recent.length === 0 && earlier.length >= 3 && sessions >= 4)
    return { reason: 'stalled', weeks: STALL_DAYS / 7 };

  const weeks = trainedWeeks(workouts, weekStartDay);
  if (blocks.length === 0 && weeks >= WEEKS_BEFORE_FIRST_BLOCK)
    return { reason: 'no-block', weeks };
  return null;
}

export function blockSuggestionLabel(suggestion: BlockSuggestion): string {
  switch (suggestion.reason) {
    case 'returning':
      return `Back after ${suggestion.days} days off`;
    case 'new-goal':
      return 'New weight goal';
    case 'stalled':
      return `No new records for ${suggestion.weeks} weeks`;
    case 'no-block':
      return `${suggestion.weeks} weeks trained, no block yet`;
  }
}
