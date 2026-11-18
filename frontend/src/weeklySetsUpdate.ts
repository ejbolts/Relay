import { creditsForWeek, type MuscleSetsWeek } from './liveMuscleSets';
import type { Exercise } from './types';

/** One muscle's weekly working-set credits before and after logging sets. */
export interface WeeklySetGain {
  muscle: string;
  before: number;
  gain: number;
  after: number;
}

/** How many muscles the logger's weekly sets shelf shows side by side. */
export const WEEKLY_SET_GAIN_LIMIT = 3;

/**
 * The weekly totals newly completed working sets of `exercise` move, largest credit first. `week` is the
 * live week, which already counts the workout's earlier completed sets. A workout dated outside
 * that week, or in the future, changes nothing shown on it.
 */
export function weeklySetGains(
  exercise: Exercise,
  week: MuscleSetsWeek | null | undefined,
  workoutDate: string,
  today: string,
  workingSetCount = 1,
  limit = WEEKLY_SET_GAIN_LIMIT,
): WeeklySetGain[] {
  if (workingSetCount <= 0) return [];
  if (!week || workoutDate < week.week_start || workoutDate > week.week_end) return [];
  if (workoutDate > today) return [];
  const totals = new Map(week.muscle_groups.map((group) => [group.muscle_group, group.raw_sets]));
  const gains = new Map<string, number>();
  for (const credit of creditsForWeek(exercise, week.week_start))
    gains.set(
      credit.muscle_name,
      (gains.get(credit.muscle_name) ?? 0) + credit.sets * workingSetCount,
    );
  return [...gains]
    .map(([muscle, gain]) => {
      const before = Math.max(0, totals.get(muscle) ?? 0);
      return { muscle, before, gain, after: before + gain };
    })
    .sort((left, right) => right.gain - left.gain || left.muscle.localeCompare(right.muscle))
    .slice(0, limit);
}

/**
 * The same totals for a whole exercise, shown once when its last set is ticked. The gain covers
 * every working set the exercise has in this workout: `week` already counts the `earlier` ones,
 * so they come back off the starting total, and `newly` are the sets being ticked now.
 */
export function exerciseSetGains(
  exercise: Exercise,
  week: MuscleSetsWeek | null | undefined,
  workoutDate: string,
  today: string,
  earlier: number,
  newly: number,
  limit = WEEKLY_SET_GAIN_LIMIT,
): WeeklySetGain[] {
  if (earlier + newly <= 0) return [];
  return weeklySetGains(exercise, week, workoutDate, today, 1, limit).map(
    ({ muscle, before, gain }) => ({
      muscle,
      before: Math.max(0, before - gain * earlier),
      gain: gain * (earlier + newly),
      after: Math.max(0, before - gain * earlier) + gain * (earlier + newly),
    }),
  );
}
