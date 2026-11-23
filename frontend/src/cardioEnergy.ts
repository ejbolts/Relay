// A conventional stored-body-fat energy comparison, not a weight-loss prediction.
// https://pubmed.ncbi.nlm.nih.gov/17848938/
import { formatWeight, weightFromKg, type WeightUnit } from './weightUnits';
import type { CardioEnergyPeriod } from './types';

export const KCAL_PER_KG_FAT_EQUIVALENT = 7700;

export function fatEnergyEquivalent(calories: number, unit: WeightUnit = 'kg'): string {
  if (unit === 'lb') {
    const kg = calories / KCAL_PER_KG_FAT_EQUIVALENT;
    return kg > 0 && weightFromKg(kg, unit) < 0.01 ? '<0.01 lb' : formatWeight(kg, unit);
  }
  const grams = (calories / KCAL_PER_KG_FAT_EQUIVALENT) * 1000;
  if (grams > 0 && grams < 1) return '<1 g';
  if (grams < 1000) return `${Math.round(grams).toLocaleString()} g`;
  return `${(grams / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} kg`;
}

export function parseCardioCalories(value: string): number | null {
  if (value.trim() === '') return null;
  const calories = Number(value);
  if (!Number.isInteger(calories) || calories < 0 || calories > 100_000) {
    throw new Error('Enter whole calories between 0 and 100,000, or leave blank.');
  }
  return calories;
}

export const CARDIO_ENERGY_PERIODS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All' },
] as const satisfies readonly { value: CardioEnergyPeriod['period']; label: string }[];

interface CardioEnergyStat {
  label: string;
  value: string;
  unit?: string;
  count?: string;
}

export function cardioEnergyStats(
  summary: CardioEnergyPeriod,
  weightUnit: WeightUnit,
): CardioEnergyStat[] {
  const sessions = (count: number) => `${count} ${count === 1 ? 'session' : 'sessions'}`;
  const distanceCount = summary.distance_sessions ?? 0;
  const elevationCount = summary.elevation_sessions ?? 0;
  const hasCalories = summary.logged_sessions > 0;
  return [
    {
      label: 'Average MET',
      value: summary.average_mets?.toFixed(1) ?? '—',
      count: sessions(summary.mets_sessions ?? 0),
    },
    {
      label: 'Elevation gain',
      value: elevationCount ? Math.round(summary.elevation_gain_m ?? 0).toLocaleString() : '—',
      unit: elevationCount ? 'm' : undefined,
      count: sessions(elevationCount),
    },
    {
      label: 'Calories',
      value: hasCalories ? summary.calories_kcal.toLocaleString() : '—',
      unit: hasCalories ? 'kcal' : undefined,
      count: `${summary.logged_sessions} of ${sessions(summary.total_sessions)}`,
    },
    {
      label: 'Fat energy equivalent',
      value: hasCalories ? `≈ ${fatEnergyEquivalent(summary.calories_kcal, weightUnit)}` : '—',
    },
    {
      label: 'Average HR',
      value: summary.average_heart_rate_bpm?.toFixed(0) ?? '—',
      unit: summary.average_heart_rate_bpm != null ? 'bpm' : undefined,
      count: sessions(summary.heart_rate_sessions ?? 0),
    },
    {
      label: 'Distance',
      value: distanceCount ? (summary.distance_km ?? 0).toFixed(2) : '—',
      unit: distanceCount ? 'km' : undefined,
      count: sessions(distanceCount),
    },
    {
      label: 'Average speed',
      value: summary.average_speed_kph?.toFixed(1) ?? '—',
      unit: summary.average_speed_kph != null ? 'km/h' : undefined,
      count: sessions(summary.speed_sessions ?? 0),
    },
    {
      label: 'Average incline',
      value:
        summary.average_incline_percent == null
          ? '—'
          : `${summary.average_incline_percent.toFixed(1)}%`,
      count: sessions(summary.incline_sessions ?? 0),
    },
  ];
}
