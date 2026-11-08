import type { MuscleSetsWeek } from './liveMuscleSets';
import type { BodyMeasurement, CardioWeek, PersonalRecord, TrackedWorkout } from './types';
import {
  addDays,
  averageOf,
  cardioSessionCount,
  recentStrengthRecords,
  weekStartFor,
  workingSets,
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
  /** Muscles with at least `goal` sets. */
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
    workouts: workouts.length,
    cardioSessions: workouts.reduce((total, workout) => total + cardioSessionCount(workout), 0),
    sets: workouts.reduce((total, workout) => total + workingSets(workout).length, 0),
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
  const reachedGoal = (items: Iterable<number>) =>
    [...items].filter((value) => value >= goal).length;
  return {
    goal,
    atGoal: reachedGoal(sets.values()),
    previousAtGoal: previous ? reachedGoal(previousSets.values()) : null,
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
    records: recentStrengthRecords(recordsIn(start), Number.POSITIVE_INFINITY),
    previousRecordCount: recentStrengthRecords(recordsIn(previousStart), Number.POSITIVE_INFINITY)
      .length,
    muscles: muscleReview(input.muscleWeeks, start, previousStart, input.muscleGoal),
    cardio: cardioReview(input.cardioWeeks, start, previousStart),
    body: {
      averageKg: averageOf(bodyWeights),
      previousAverageKg: averageOf(weights(previousStart)),
      checkIns: bodyWeights.length,
    },
  };
}
