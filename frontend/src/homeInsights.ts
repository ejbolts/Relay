import { bodyGoalKind, maintenanceRange, type BodyGoalKind } from './bodyMeasurementHistory';
import type { MuscleSetsWeek } from './liveMuscleSets';
import { addDays, daysBetween, weekStartFor } from './trainingSummary';
import type {
  BodyWeightGoal,
  ExerciseLibrarySummary,
  FriendActivity,
  TrackedWorkout,
} from './types';

/** Within this many kg of the line to the target date counts as on track. */
const ON_TRACK_KG = 0.1;

export interface BodyGoalProgress {
  kind: BodyGoalKind;
  current_kg: number;
  /** Share of the planned change made so far, 0 to 1; null for maintain goals. */
  done: number | null;
  /** Share of the time to the target date that has passed, 0 to 1. */
  elapsed: number;
  /** Ahead of (positive) or behind (negative) the straight line to the goal, in kg. */
  ahead_kg: number | null;
  /** kg changed so far towards the goal, and the planned change. */
  changed_kg: number;
  planned_kg: number;
  days_left: number;
  range: [number, number] | null;
  status: 'below' | 'in' | 'above' | null;
}

export function bodyGoalProgress(
  goal: BodyWeightGoal,
  currentKg: number,
  today: string,
): BodyGoalProgress {
  const kind = bodyGoalKind(goal);
  const range = maintenanceRange(goal);
  const length = Math.max(1, daysBetween(goal.start_date, goal.target_date));
  const elapsed = Math.min(1, Math.max(0, daysBetween(goal.start_date, today) / length));
  const planned = goal.target_weight_kg - goal.start_weight_kg;
  const changed = currentKg - goal.start_weight_kg;
  const base = {
    kind,
    current_kg: currentKg,
    elapsed,
    days_left: Math.max(0, daysBetween(today, goal.target_date)),
    range,
  };
  if (kind === 'maintain') {
    const [low, high] = range ?? [goal.target_weight_kg, goal.target_weight_kg];
    return {
      ...base,
      done: null,
      ahead_kg: null,
      changed_kg: 0,
      planned_kg: 0,
      status:
        currentKg < low - ON_TRACK_KG ? 'below' : currentKg > high + ON_TRACK_KG ? 'above' : 'in',
    };
  }
  const expected = goal.start_weight_kg + planned * elapsed;
  // Losing weight is ahead when below the line; gaining is ahead when above it.
  const ahead = kind === 'loss' ? expected - currentKg : currentKg - expected;
  return {
    ...base,
    done: Math.min(1, Math.max(0, changed / planned)),
    ahead_kg: Math.abs(ahead) < ON_TRACK_KG ? 0 : ahead,
    changed_kg: Math.max(0, kind === 'loss' ? -changed : changed),
    planned_kg: Math.abs(planned),
    status: null,
  };
}

/** The chosen lift when it has a trend, otherwise the most-trained lift with one. */
export function spotlightSummary(
  summaries: ExerciseLibrarySummary[],
  exerciseId: string | null,
): ExerciseLibrarySummary | null {
  const usable = summaries.filter((item) => item.latest_estimated_1rm != null);
  return (
    usable.find((item) => item.exercise_id === exerciseId) ??
    [...usable].sort(
      (a, b) => b.session_count - a.session_count || b.last_date.localeCompare(a.last_date),
    )[0] ??
    null
  );
}

export interface MuscleFreshness {
  muscle: string;
  last_date: string;
  days: number;
}

/** How long a muscle needs before it counts as fresh again. */
export const FRESH_AFTER_DAYS = 3;

/**
 * Days since each muscle last got working-set credit, most rested first, from the same weekly
 * set counts as Sets per muscle, so the muscle names match. Pass this week (with the workout in
 * progress) and the earlier weeks. Muscles not trained in the last `lookbackDays` are left out.
 */
export function muscleFreshness(
  weeks: (MuscleSetsWeek | null | undefined)[],
  today: string,
  lookbackDays = 28,
): MuscleFreshness[] {
  const cutoff = addDays(today, -lookbackDays);
  const latest = new Map<string, string>();
  for (const week of weeks) {
    for (const group of week?.muscle_groups ?? []) {
      for (const contribution of group.contributions ?? []) {
        const date = contribution.workout_date;
        if (contribution.set_credits <= 0 || date < cutoff || date > today) continue;
        if ((latest.get(group.muscle_group) ?? '') < date) latest.set(group.muscle_group, date);
      }
    }
  }
  return [...latest]
    .map(([muscle, date]) => ({ muscle, last_date: date, days: daysBetween(date, today) }))
    .sort((a, b) => b.days - a.days || a.muscle.localeCompare(b.muscle));
}

export function freshnessLabel(days: number, short = false): string {
  if (days <= 0) return 'Today';
  if (days === 1) return short ? '1 d' : 'Yesterday';
  return short ? `${days} d` : `${days} days`;
}

export function freshnessLevel(days: number): 'recent' | 'recovering' | 'fresh' {
  return days >= FRESH_AFTER_DAYS ? 'fresh' : days >= 2 ? 'recovering' : 'recent';
}

export interface WeekStanding {
  id: string;
  display_name: string;
  profile_photo_url: string | null;
  profile_border?: string | null;
  is_you: boolean;
  /** Days with a workout so far this week. */
  days: number;
  /** Workouts in the last 30 days, which breaks ties. */
  recent: number;
  friend?: FriendActivity;
}

/** You and your friends by training days this week, then by workouts in the last 30 days. */
export function weekStandings(
  friends: FriendActivity[],
  you: Pick<WeekStanding, 'id' | 'display_name' | 'profile_photo_url'>,
  workouts: TrackedWorkout[],
  today: string,
  weekStartDay: number,
): WeekStanding[] {
  const weekStart = weekStartFor(today, weekStartDay);
  const monthStart = addDays(today, -29);
  const counted = workouts.filter((workout) => !workout.is_sample && workout.workout_date <= today);
  const daysIn = (dates: string[]) =>
    new Set(dates.filter((date) => date >= weekStart && date <= today)).size;
  const rows: WeekStanding[] = [
    {
      ...you,
      is_you: true,
      days: daysIn(counted.map((workout) => workout.workout_date)),
      recent: counted.filter((workout) => workout.workout_date >= monthStart).length,
    },
    ...friends.map((friend) => ({
      id: friend.id,
      display_name: friend.display_name,
      profile_photo_url: friend.profile_photo_url,
      profile_border: friend.profile_border,
      is_you: false,
      days: daysIn(friend.training_dates),
      recent: friend.recent_workout_count,
      friend,
    })),
  ];
  return rows.sort(
    (a, b) =>
      b.days - a.days ||
      b.recent - a.recent ||
      Number(b.is_you) - Number(a.is_you) ||
      a.display_name.localeCompare(b.display_name),
  );
}

export function ordinal(value: number): string {
  const tens = value % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] ?? 'th');
  return `${value}${suffix}`;
}

/** The first day of the selected period: this week's start or the 1st of this month. */
export function distancePeriodStart(
  period: 'week' | 'month',
  today: string,
  weekStartDay: number,
): string {
  return period === 'week' ? weekStartFor(today, weekStartDay) : `${today.slice(0, 8)}01`;
}
