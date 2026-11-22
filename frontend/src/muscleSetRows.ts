import { muscleSetGoal, type MuscleSetGoals } from './muscleSetGoals';
import type { WeeklyMuscleSets, WeeklySets } from './types';

// Plain functions with no React or browser APIs: Home's Sets per muscle card on the web and the
// native app (mobile/) both read their rows from here. Keep this file and its imports free of
// packages and DOM access; the mobile checks build them too.

type MuscleGroup = Pick<WeeklyMuscleSets, 'muscle_group' | 'raw_sets' | 'contributions'>;
type Week = Pick<WeeklySets, 'week_start' | 'week_end'> & { muscle_groups: MuscleGroup[] };

/** One muscle's row: this week's sets, the week before's (null with no earlier week) and its goal. */
export type MuscleSetRow = MuscleGroup & {
  previous: number | null;
  change: number | null;
  target: number;
};

/** Set credits as shown: up to three decimals, so 2.5 assistance credits read as "2.5". */
export const setCredits = (value: number) => Number(value.toFixed(3)).toLocaleString();

export const muscleWeekName = (weeksAgo: number) =>
  weeksAgo === 0 ? 'This week' : weeksAgo === 1 ? 'Last week' : `${weeksAgo} weeks ago`;

/** "+2", "−1.5" or "±0" for the change on the week before. */
export function signedSetChange(change: number) {
  if (change > 0) return `+${setCredits(change)}`;
  if (change < 0) return `−${setCredits(-change)}`;
  return '±0';
}

/** This week is still going, so a shortfall on the week before is pending, not a drop yet. */
export function setChangeTone(
  change: number,
  current: boolean,
): 'up' | 'down' | 'pending' | 'same' {
  if (change > 0) return 'up';
  if (change < 0) return current ? 'pending' : 'down';
  return 'same';
}

export function setChangeLabel(change: number, current: boolean) {
  if (change === 0) return 'same as the week before';
  if (change < 0 && current) return `${setCredits(-change)} to match the week before`;
  return `${change > 0 ? 'up' : 'down'} ${setCredits(Math.abs(change))} on the week before`;
}

/**
 * The card's rows for the week `weeksAgo` weeks back (clamped to the weeks there are): muscles
 * by sets, then by the week before's, then by name. Muscles trained only the week before still
 * get a row, so the drop shows. Collapsed, it lists the first eight trained muscles; expanded,
 * every muscle the week knows. `scale` is shared by all weeks so bars and goal ticks stay put
 * while stepping through history.
 */
export function muscleSetsView({
  weeklySets,
  history = [],
  weeksAgo: requestedWeeksAgo,
  goal,
  goals,
  expanded,
}: {
  weeklySets: Week | null | undefined;
  /** The weeks before `weeklySets`, newest first. Older cached dashboards have none. */
  history?: Week[];
  weeksAgo: number;
  goal: number;
  goals?: MuscleSetGoals;
  expanded: boolean;
}) {
  const weeks = weeklySets ? [weeklySets, ...history] : [];
  const weeksAgo = Math.min(requestedWeeksAgo, Math.max(0, weeks.length - 1));
  const week = weeks[weeksAgo];
  const previous = weeks[weeksAgo + 1];
  const previousSets = new Map(
    (previous?.muscle_groups ?? []).map((item) => [item.muscle_group, item.raw_sets]),
  );
  const before = (name: string) => (previous ? (previousSets.get(name) ?? 0) : null);
  const groups = new Map<string, MuscleGroup>(
    (week?.muscle_groups ?? []).map((item) => [item.muscle_group, item]),
  );
  for (const item of previous?.muscle_groups ?? []) {
    if (item.raw_sets > 0 && !groups.has(item.muscle_group)) {
      groups.set(item.muscle_group, {
        muscle_group: item.muscle_group,
        raw_sets: 0,
        contributions: [],
      });
    }
  }
  const allMuscles = [...groups.values()].sort(
    (left, right) =>
      right.raw_sets - left.raw_sets ||
      (before(right.muscle_group) ?? 0) - (before(left.muscle_group) ?? 0) ||
      left.muscle_group.localeCompare(right.muscle_group),
  );
  const trained = allMuscles.filter(
    (item) => item.raw_sets > 0 || (before(item.muscle_group) ?? 0) > 0,
  );
  const visible = expanded ? allMuscles : trained.slice(0, 8);
  const scale = Math.max(
    goal * 1.15,
    ...allMuscles.map((item) => muscleSetGoal(item.muscle_group, goal, goals) * 1.15),
    ...weeks.flatMap((item) => item.muscle_groups.map((group) => group.raw_sets)),
  );
  const rows: MuscleSetRow[] = visible.map((item) => {
    const last = before(item.muscle_group);
    return {
      ...item,
      previous: last,
      change: last === null ? null : item.raw_sets - last,
      target: muscleSetGoal(item.muscle_group, goal, goals),
    };
  });
  return {
    weeks,
    weeksAgo,
    week,
    previous,
    current: weeksAgo === 0,
    name: muscleWeekName(weeksAgo),
    allMuscles,
    trainedCount: trained.length,
    rows,
    untrained: allMuscles.filter((item) => item.raw_sets <= 0).length,
    scale,
    canExpand: expanded || allMuscles.length > visible.length,
  };
}
