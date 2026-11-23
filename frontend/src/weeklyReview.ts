import { muscleSetGoal, type MuscleSetGoals } from './muscleSetGoals';
import type { MuscleSetsWeek } from './liveMuscleSets';
import type { BodyMeasurement, CardioWeek, PersonalRecord, TrackedWorkout } from './types';
import {
  addDays,
  averageOf,
  cardioSessionCount,
  isStrengthWorkout,
  prSetCount,
  recentRecords,
  strengthSets,
  weekStartDayFrom,
  weekStartFor,
  workoutVolumeKg,
} from './trainingSummary';

export interface WeeklyTrainingTotals {
  workouts: number;
  cardioSessions: number;
  sets: number;
  volumeKg: number;
}

export interface WeeklyMuscleMover {
  muscle: string;
  sets: number;
  change: number;
}

export interface WeeklyMuscleReview {
  goal: number;
  /** Muscles meeting their own target, or the default `goal`. */
  atGoal: number;
  previousAtGoal: number | null;
  totalSets: number;
  previousTotalSets: number | null;
  /** The muscles whose set count moved most against the week before. */
  movers: WeeklyMuscleMover[];
}

export interface WeeklyZoneReview {
  zone: number;
  minutes: number;
  /** Null when the week before is not in the data. */
  previousMinutes: number | null;
  goalMinutes: number;
}

export interface WeeklyCardioReview {
  totalMinutes: number;
  previousTotalMinutes: number | null;
  zones: WeeklyZoneReview[];
}

export interface WeeklyBodyReview {
  averageKg: number | null;
  previousAverageKg: number | null;
  checkIns: number;
}

export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  /** False while the week is still running, so its totals are "so far". */
  complete: boolean;
  training: WeeklyTrainingTotals;
  previousTraining: WeeklyTrainingTotals;
  records: PersonalRecord[];
  /** PRs this week, one per set. */
  recordCount: number;
  previousRecordCount: number;
  /** Null when the dashboard has no set data for this week yet. */
  muscles: WeeklyMuscleReview | null;
  /** Null when the dashboard has no cardio for this week (older cached dashboards). */
  cardio: WeeklyCardioReview | null;
  body: WeeklyBodyReview;
}

export interface WeeklyReviewInput {
  workouts: TrackedWorkout[];
  records: PersonalRecord[];
  measurements: Array<Pick<BodyMeasurement, 'measurement_date' | 'weight_kg'>>;
  /** Weeks of per-muscle sets from the dashboard, matched to the review by their start date. */
  muscleWeeks: MuscleSetsWeek[];
  muscleGoal: number;
  muscleGoals?: MuscleSetGoals;
  /** Weeks of cardio from the dashboard, matched to the review by their start date. */
  cardioWeeks: CardioWeek[];
  today: string;
  weekStartDay: number;
  /** 0 is the current week. */
  weeksAgo: number;
}

const inWeek = (date: string, start: string, today: string) =>
  date >= start && date <= addDays(start, 6) && date <= today;

function trainingTotals(workouts: TrackedWorkout[]): WeeklyTrainingTotals {
  return {
    // Cardio-only sessions are counted under cardio, so Workouts and Sets cover strength work.
    workouts: workouts.filter(isStrengthWorkout).length,
    cardioSessions: workouts.reduce((total, workout) => total + cardioSessionCount(workout), 0),
    sets: workouts.reduce((total, workout) => total + strengthSets(workout).length, 0),
    volumeKg: workouts.reduce((total, workout) => total + workoutVolumeKg(workout), 0),
  };
}

function cardioReview(
  weeks: CardioWeek[],
  start: string,
  previousStart: string,
): WeeklyCardioReview | null {
  const week = weeks.find((item) => item.week_start === start);
  if (!week) return null;
  const previous = weeks.find((item) => item.week_start === previousStart);
  return {
    totalMinutes: week.total_minutes,
    previousTotalMinutes: previous ? previous.total_minutes : null,
    zones: [...week.goals]
      .sort((left, right) => left.zone - right.zone)
      .map((goal) => ({
        zone: goal.zone,
        minutes: goal.completed_minutes,
        previousMinutes: previous
          ? (previous.goals.find((item) => item.zone === goal.zone)?.completed_minutes ?? 0)
          : null,
        goalMinutes: goal.goal_minutes,
      })),
  };
}

function muscleReview(
  weeks: MuscleSetsWeek[],
  start: string,
  previousStart: string,
  goal: number,
  goals?: MuscleSetGoals,
): WeeklyMuscleReview | null {
  const week = weeks.find((item) => item.week_start === start);
  if (!week) return null;
  const previous = weeks.find((item) => item.week_start === previousStart);
  const previousSets = new Map(
    (previous?.muscle_groups ?? []).map((item) => [item.muscle_group, item.raw_sets]),
  );
  const sets = new Map(week.muscle_groups.map((item) => [item.muscle_group, item.raw_sets]));
  const names = new Set([...sets.keys(), ...previousSets.keys()]);
  const movers = [...names]
    .map((muscle) => ({
      muscle,
      sets: sets.get(muscle) ?? 0,
      change: (sets.get(muscle) ?? 0) - (previousSets.get(muscle) ?? 0),
    }))
    .filter((item) => previous && item.change !== 0)
    .sort(
      (left, right) =>
        Math.abs(right.change) - Math.abs(left.change) || left.muscle.localeCompare(right.muscle),
    )
    .slice(0, 3);
  const total = (items: Iterable<number>) =>
    [...items].reduce((sum, value) => sum + Math.max(value, 0), 0);
  const reachedGoal = (items: Map<string, number>) =>
    [...items].filter(([muscle, value]) => value >= muscleSetGoal(muscle, goal, goals)).length;
  return {
    goal,
    atGoal: reachedGoal(sets),
    previousAtGoal: previous ? reachedGoal(previousSets) : null,
    totalSets: total(sets.values()),
    previousTotalSets: previous ? total(previousSets.values()) : null,
    movers,
  };
}

/** Whether the week has anything worth reviewing: training, cardio, records or a weigh-in. */
export function reviewHasActivity(review: WeeklyReview): boolean {
  return Boolean(
    review.training.workouts ||
    review.training.cardioSessions ||
    review.cardio?.totalMinutes ||
    review.records.length ||
    review.body.checkIns,
  );
}

/**
 * What changed in one week against the week before it. Like the rest of Home it counts every
 * logged workout, sample data included, and ignores unperformed sets (through `workingSets`).
 */
export function weeklyReview(input: WeeklyReviewInput): WeeklyReview {
  const start = addDays(weekStartFor(input.today, input.weekStartDay), -7 * input.weeksAgo);
  const previousStart = addDays(start, -7);
  const workoutsIn = (weekStart: string) =>
    input.workouts.filter((workout) => inWeek(workout.workout_date, weekStart, input.today));
  const recordsIn = (weekStart: string) =>
    input.records.filter((record) => inWeek(record.achieved_date, weekStart, input.today));
  const weights = (weekStart: string) =>
    input.measurements
      .filter((item) => inWeek(item.measurement_date, weekStart, input.today))
      .map((item) => item.weight_kg);
  const bodyWeights = weights(start);
  return {
    weekStart: start,
    weekEnd: addDays(start, 6),
    complete: addDays(start, 6) <= input.today,
    training: trainingTotals(workoutsIn(start)),
    previousTraining: trainingTotals(workoutsIn(previousStart)),
    records: recentRecords(recordsIn(start), Number.POSITIVE_INFINITY),
    recordCount: prSetCount(recordsIn(start)),
    previousRecordCount: prSetCount(recordsIn(previousStart)),
    muscles: muscleReview(
      input.muscleWeeks,
      start,
      previousStart,
      input.muscleGoal,
      input.muscleGoals,
    ),
    cardio: cardioReview(input.cardioWeeks, start, previousStart),
    body: {
      averageKg: averageOf(bodyWeights),
      previousAverageKg: averageOf(weights(previousStart)),
      checkIns: bodyWeights.length,
    },
  };
}

/** What every week's review is drawn from, as the popup steps between weeks. */
export interface WeeklyReviewData {
  workouts: TrackedWorkout[];
  records: PersonalRecord[];
  measurements: BodyMeasurement[];
  /** Per-muscle sets for the current week followed by earlier weeks, newest first. */
  muscleWeeks: MuscleSetsWeek[];
  muscleGoal: number;
  muscleGoals?: MuscleSetGoals;
  /** Cardio for the current week then earlier weeks, newest first. */
  cardioWeeks: CardioWeek[];
  today: string;
  weekStartDay: number;
}

/** Last week's review, as listed in the notifications inbox until the next week begins. */
export interface WeeklyReviewNotice {
  /** First day of the reviewed week. */
  weekStart: string;
  /** Last day of the reviewed week. */
  weekEnd: string;
  /** False once the review popup has been shown for this week. */
  unread: boolean;
}

/** The dashboard's weeks of per-muscle sets for the review: this week, then earlier weeks. */
export function reviewMuscleWeeks(
  current: MuscleSetsWeek | null | undefined,
  history: MuscleSetsWeek[] | null | undefined,
): MuscleSetsWeek[] {
  return current ? [current, ...(history ?? [])] : [];
}

export interface LastWeekReview {
  /** The first day of the current week. */
  currentStart: string;
  weekStartDay: number;
  /** Null until the dashboard has loaded for the current week. */
  review: WeeklyReview | null;
  /** The review can open: the person logged something themselves last week. */
  available: boolean;
}

/**
 * The finished week's review, which opens by itself the first time the app is used in a new
 * week. It waits until the dashboard has loaded for the current week, so a cached older
 * dashboard is never reviewed as if it were last week's, and is unavailable when the person
 * logged nothing themselves (sample workouts aside) that week.
 */
export function lastWeekReview(
  input: Omit<WeeklyReviewData, 'weekStartDay'> & {
    /** Whether the dashboard has loaded. */
    loaded: boolean;
    /** The dashboard's current week of sets starts here. */
    dashboardWeekStart: string | null;
  },
): LastWeekReview {
  const weekStartDay = weekStartDayFrom(input.dashboardWeekStart);
  const currentStart = weekStartFor(input.today, weekStartDay);
  const fresh = input.loaded && input.dashboardWeekStart === currentStart;
  const review = fresh
    ? weeklyReview({
        workouts: input.workouts,
        records: input.records,
        measurements: input.measurements,
        muscleWeeks: input.muscleWeeks,
        muscleGoal: input.muscleGoal,
        muscleGoals: input.muscleGoals,
        cardioWeeks: input.cardioWeeks,
        today: input.today,
        weekStartDay,
        weeksAgo: 1,
      })
    : null;
  const lastWeekEnd = addDays(currentStart, -1);
  const loggedItself =
    review !== null &&
    input.workouts.some(
      (workout) =>
        !workout.is_sample &&
        workout.workout_date >= review.weekStart &&
        workout.workout_date <= lastWeekEnd,
    );
  return {
    currentStart,
    weekStartDay,
    review,
    available: review !== null && loggedItself && reviewHasActivity(review),
  };
}

/** The bell's weekly review notice while a review is available, new until it has been seen. */
export function weeklyReviewNoticeFor(
  state: Pick<LastWeekReview, 'review' | 'available' | 'currentStart'>,
  seenWeek: string | null,
): WeeklyReviewNotice | null {
  return state.available && state.review
    ? {
        weekStart: state.review.weekStart,
        weekEnd: state.review.weekEnd,
        unread: seenWeek !== state.currentStart,
      }
    : null;
}
