import { dateRangeForDates, type TimeRange } from './dateRanges';

export type BodyTrendRange = TimeRange;

export const BODY_TREND_DURATION_OPTIONS = [
  { value: '7d', label: '7 days', days: 7 },
  { value: '14d', label: '14 days', days: 14 },
  { value: '30d', label: '30 days', days: 30 },
  { value: '60d', label: '60 days', days: 60 },
  { value: '90d', label: '90 days', days: 90 },
  { value: '6m', label: '6 months', months: 6 },
  { value: '1y', label: '1 year', months: 12 },
] as const;

export type BodyTrendDuration = (typeof BODY_TREND_DURATION_OPTIONS)[number]['value'];
export type BodyTrendStatistic = 'average' | 'median';

export interface WeightedMeasurement extends DatedMeasurement {
  weight_kg: number;
}

export interface BodyWeightTrendSummary {
  average: number | null;
  median: number | null;
  count: number;
}

export function bodyweightEntryPlaceholder(measurements: WeightedMeasurement[]): string {
  return measurements[0] ? measurements[0].weight_kg.toFixed(1) : '88.0';
}

export interface DatedMeasurement {
  measurement_date: string;
}

export interface BodyWeightGoalPath {
  start_date: string;
  target_date: string;
  start_weight_kg: number;
  target_weight_kg: number;
  maintenance_min_kg?: number | null;
  maintenance_max_kg?: number | null;
}

function dateOnlyUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function clipBodyWeightGoalPath(
  goal: BodyWeightGoalPath,
  startDate?: string,
  endDate?: string,
): BodyWeightGoalPath | null {
  const goalStart = dateOnlyUtc(goal.start_date).getTime();
  const goalEnd = dateOnlyUtc(goal.target_date).getTime();
  const clippedStart = startDate
    ? Math.max(goalStart, dateOnlyUtc(startDate).getTime())
    : goalStart;
  const clippedEnd = endDate ? Math.min(goalEnd, dateOnlyUtc(endDate).getTime()) : goalEnd;
  if (clippedStart > clippedEnd) return null;

  const weightAt = (time: number) => {
    if (goalEnd === goalStart) return goal.target_weight_kg;
    const ratio = (time - goalStart) / (goalEnd - goalStart);
    return goal.start_weight_kg + ratio * (goal.target_weight_kg - goal.start_weight_kg);
  };

  return {
    ...goal,
    start_date: new Date(clippedStart).toISOString().slice(0, 10),
    target_date: new Date(clippedEnd).toISOString().slice(0, 10),
    start_weight_kg: weightAt(clippedStart),
    target_weight_kg: weightAt(clippedEnd),
  };
}

export function bodyTrendCutoffDate(latestDate: string, duration: BodyTrendDuration): string {
  const option = BODY_TREND_DURATION_OPTIONS.find((item) => item.value === duration)!;
  const cutoff = dateOnlyUtc(latestDate);
  if ('days' in option) {
    cutoff.setUTCDate(cutoff.getUTCDate() - (option.days - 1));
  } else {
    const originalDay = cutoff.getUTCDate();
    cutoff.setUTCDate(1);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - option.months);
    const lastDay = new Date(
      Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0),
    ).getUTCDate();
    cutoff.setUTCDate(Math.min(originalDay, lastDay));
  }
  return cutoff.toISOString().slice(0, 10);
}

export function summarizeBodyWeightTrend<T extends WeightedMeasurement>(
  measurements: T[],
  duration: BodyTrendDuration,
): BodyWeightTrendSummary {
  if (measurements.length === 0) return { average: null, median: null, count: 0 };
  const latestDate = measurements.reduce(
    (latest, item) => (item.measurement_date > latest ? item.measurement_date : latest),
    measurements[0].measurement_date,
  );
  const cutoff = bodyTrendCutoffDate(latestDate, duration);
  const weights = measurements
    .filter((item) => item.measurement_date >= cutoff && item.measurement_date <= latestDate)
    .map((item) => item.weight_kg)
    .sort((first, second) => first - second);
  if (weights.length === 0) return { average: null, median: null, count: 0 };
  const middle = Math.floor(weights.length / 2);
  const median =
    weights.length % 2 === 0 ? (weights[middle - 1] + weights[middle]) / 2 : weights[middle];
  return {
    average: weights.reduce((total, value) => total + value, 0) / weights.length,
    median,
    count: weights.length,
  };
}

export function filterMeasurementsByRange<T extends DatedMeasurement>(
  measurements: T[],
  range: BodyTrendRange,
): T[] {
  const { start_date: cutoff } = dateRangeForDates(
    measurements.map((item) => item.measurement_date),
    range,
  );
  if (!cutoff) return measurements;
  return measurements.filter((item) => item.measurement_date >= cutoff);
}

export function nearestChartPointIndex(
  chartX: number,
  chartStart: number,
  chartEnd: number,
  pointCount: number,
): number {
  if (pointCount <= 1) return 0;
  const ratio = Math.min(1, Math.max(0, (chartX - chartStart) / (chartEnd - chartStart)));
  return Math.round(ratio * (pointCount - 1));
}
