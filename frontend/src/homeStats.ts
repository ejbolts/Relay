import {
  averageOf,
  daysBetween,
  weeklyBodyweightAverages,
  type WeeklyTotals,
} from './trainingSummary';
import type { BodyCheckInMode } from './homeLayout';
import type { BodyMeasurement, CardioGoalWeek, DashboardData } from './types';
import { formatWeight, weightFromKg, weightToKg, type WeightUnit } from './weightUnits';

/** Home's Workouts and Cardio sessions cards: this week's count and the weekly trend. */
export function homeActivityStats({
  weeks,
  haveWorkouts,
  data,
  workoutWeeks,
  cardioWeeks,
}: {
  /** Weekly totals, oldest first, ending with the current week. */
  weeks: WeeklyTotals[];
  haveWorkouts: boolean;
  data: Pick<DashboardData, 'workouts_this_week'> | null | undefined;
  workoutWeeks: number;
  cardioWeeks: number;
}) {
  const currentWeek = weeks.at(-1);
  const workoutHistory = weeks.slice(-workoutWeeks).map((week) => week.workouts);
  const cardioHistory = weeks.slice(-cardioWeeks).map((week) => week.cardioSessions);
  return {
    workoutsThisWeek: haveWorkouts
      ? (currentWeek?.workouts ?? 0)
      : (data?.workouts_this_week ?? null),
    // Cardio sessions are mirrored from workouts' cardio movements, so no workouts means none.
    cardioSessionsThisWeek: haveWorkouts ? (currentWeek?.cardioSessions ?? 0) : data ? 0 : null,
    workoutHistory,
    cardioHistory,
    averageWorkouts: averageOf(workoutHistory),
    averageCardioSessions: averageOf(cardioHistory),
  };
}

/** "8-wk avg 3.4", or "This week" before there is a trend. */
export function activityAverageLabel(average: number | null, weeks: number): string {
  return average === null ? 'This week' : `${weeks}-wk avg ${average.toFixed(1)}`;
}

/** Home's body weight cards and check-in, from check-ins newest first. */
export function homeBodyweightStats(
  measurements: BodyMeasurement[],
  today: string,
  weekStartDay: number,
) {
  const latest = measurements[0] ?? null;
  const monthAgo = latest
    ? measurements.find(
        (measurement) => daysBetween(measurement.measurement_date, latest.measurement_date) >= 28,
      )
    : null;
  return {
    latest,
    today: measurements.find((item) => item.measurement_date === today) ?? null,
    priorBodyweight: measurements.find((item) => item.measurement_date < today)?.weight_kg ?? null,
    priorBodyFat:
      measurements.find((item) => item.measurement_date < today && item.body_fat_pct !== null)
        ?.body_fat_pct ?? null,
    latestBodyFat: measurements.find((item) => item.body_fat_pct !== null)?.body_fat_pct ?? null,
    /** The last 30 check-ins' weights in kg, oldest first. */
    recentWeights: measurements
      .slice(0, 30)
      .map((measurement) => measurement.weight_kg)
      .reverse(),
    /** Change since the latest check-in at least four weeks before the newest one, in kg. */
    monthChange: latest && monthAgo ? latest.weight_kg - monthAgo.weight_kg : null,
    /** Average weight of each of the last 12 weeks that has a check-in, oldest first. */
    weeklyWeights: weeklyBodyweightAverages(measurements, today, weekStartDay, 12).filter(
      (value): value is number => value !== null,
    ),
  };
}

/** A weight change with its sign, such as "+1.2 kg", "−0.4 lb" or "±0.0 kg". */
export function signedWeightChange(changeKg: number, unit: WeightUnit): string {
  const sign = changeKg > 0 ? '+' : changeKg < 0 ? '−' : '±';
  return `${sign}${weightFromKg(Math.abs(changeKg), unit).toFixed(1)} ${unit}`;
}

/** The Body weight stat card's caption. */
export function bodyweightStatCaption(
  monthChange: number | null,
  count: number,
  unit: WeightUnit,
): string {
  if (monthChange !== null) return `${signedWeightChange(monthChange, unit)} / 4 wk`;
  return count ? `${count} ${count === 1 ? 'check-in' : 'check-ins'}` : 'No check-ins';
}

/** The Bodyweight trend card's caption. */
export function bodyweightTrendCaption(
  monthChange: number | null,
  count: number,
  unit: WeightUnit,
): string {
  return monthChange === null
    ? `${count} check-ins`
    : `${signedWeightChange(monthChange, unit)} in 30 days`;
}

/** The goals Home's cardio card shows, and the days left in their week. */
export function homeCardioGoals(
  data: Pick<DashboardData, 'zone2' | 'cardio_goals'> | null | undefined,
  today: string,
): { goals: CardioGoalWeek[]; daysLeft: number | null } {
  const zone2 = data?.zone2 ?? null;
  return {
    goals: data?.cardio_goals ?? (zone2 ? [{ zone: 2, ...zone2 }] : []),
    daysLeft: zone2 ? Math.max(0, daysBetween(today, zone2.week_end) + 1) : null,
  };
}

/** Today's reading against the one before it, as the check-in shows it (one decimal). */
export function checkInChange(prior: number | null, today: number | null): number | null {
  return prior === null || today === null
    ? null
    : Number((Number(today.toFixed(1)) - Number(prior.toFixed(1))).toFixed(1));
}

/** A weight stepped by `delta` in the shown unit, from the typed weight or the latest one. */
export function nudgedBodyweightKg(
  selectedKg: number | null,
  latestKg: number | null,
  delta: number,
  unit: WeightUnit,
): number {
  const base =
    selectedKg !== null && Number.isFinite(selectedKg) && selectedKg > 0
      ? selectedKg
      : (latestKg ?? 0);
  return weightToKg(Number(Math.max(0, weightFromKg(base, unit) + delta).toFixed(2)), unit);
}

/** A body-fat entry stepped by `delta`, kept within 1–70%. */
export function nudgedBodyFat(text: string, latest: number | null, delta: number): string {
  const current = Number(text);
  const base = text !== '' && Number.isFinite(current) ? current : (latest ?? 0);
  return Math.min(70, Math.max(1, base + delta)).toFixed(1);
}

/** The typed body fat, or NaN when it is empty. */
export function bodyFatEntry(text: string): number {
  return text.trim() === '' ? NaN : Number(text);
}

export const BODY_FAT_RANGE_ERROR = 'Enter body fat from 1% to 70%.';

export function validBodyFat(value: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= 70;
}

/** What Home's check-in saves: its weight (and body fat, when it asks for both), or why not. */
export function quickCheckInEntry({
  weightKg,
  bodyFat,
  requireBodyFat,
  unit,
}: {
  weightKg: number | null;
  bodyFat: number;
  requireBodyFat: boolean;
  unit: WeightUnit;
}): { error: string } | { error: null; weightKg: number } {
  if (weightKg === null || !Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 500) {
    return { error: `Enter a bodyweight above 0 and up to ${formatWeight(500, unit)}.` };
  }
  if (requireBodyFat && !validBodyFat(bodyFat)) return { error: BODY_FAT_RANGE_ERROR };
  return { error: null, weightKg };
}

/** The toast after a Home check-in saves. */
export function checkInSavedMessage(kind: 'weight' | 'fat' | 'combined'): string {
  return kind === 'combined'
    ? 'Check-in saved'
    : kind === 'fat'
      ? 'Body fat saved'
      : 'Body weight saved';
}

/** Home's check-in reads the older two-button Combined mode as the one-button card. */
export function homeCheckInMode(mode: BodyCheckInMode): BodyCheckInMode {
  return mode === 'combined' ? 'combined-single' : mode;
}

/**
 * How the check-in card behaves in its mode. Body fat is stored on a weigh-in, so until today's
 * weight is in, Body fat only asks for both.
 */
export function bodyCheckInView({
  mode: configured,
  todayBodyweight,
  todayBodyFat,
  canSaveBodyFat = true,
}: {
  mode: BodyCheckInMode;
  todayBodyweight: number | null;
  todayBodyFat: number | null;
  canSaveBodyFat?: boolean;
}) {
  const mode: BodyCheckInMode =
    configured === 'fat' && canSaveBodyFat && todayBodyweight === null
      ? 'combined-single'
      : configured;
  const singleButton = mode === 'combined-single' && canSaveBodyFat;
  const fatOnly = mode === 'fat' && canSaveBodyFat;
  return {
    mode,
    singleButton,
    combined: mode === 'combined' || singleButton,
    headerSave: singleButton || mode !== 'combined',
    fatOnly,
    showWeight: mode !== 'fat' || !canSaveBodyFat,
    showFat: canSaveBodyFat && mode !== 'weight',
    hasToday: fatOnly
      ? todayBodyFat !== null
      : singleButton
        ? todayBodyweight !== null && todayBodyFat !== null
        : todayBodyweight !== null,
    saveKind: fatOnly ? 'body fat' : singleButton ? 'check-in' : 'weight',
  } as const;
}
