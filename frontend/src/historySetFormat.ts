import type { TrackedSet } from './types';
import { formatSeconds } from './utils';
import { formatWeight, type WeightUnit } from './weightUnits';

/**
 * A saved set's one-line result in history: "80 kg × 8", "12 reps" for a bodyweight set, or a
 * cardio set's time, distance, incline and speed. Shared by the web and the mobile app.
 */
export function setResult(item: TrackedSet, weightUnit: WeightUnit): string {
  // A bodyweight set is saved at 0 kg; its reps are what matter.
  if (item.weight_kg === 0 && item.reps !== null) return `${item.reps} reps`;
  if (item.weight_kg !== null)
    return `${formatWeight(item.weight_kg, weightUnit)} × ${item.reps ?? '–'}`;
  const cardioValues = [
    item.duration_seconds ? formatSeconds(item.duration_seconds) : null,
    item.distance_km !== null ? `${item.distance_km} km` : null,
    item.incline_percent !== null ? `${item.incline_percent}% incline` : null,
    item.speed_kph !== null ? `${item.speed_kph} km/h` : null,
  ].filter((value): value is string => value !== null);
  if (cardioValues.length) return cardioValues.join(' · ');
  return `${item.reps ?? '–'} reps`;
}

/** A record's name, such as "Weight PR" or "Fastest 5 km" (defined with the other record names). */
export { recordTypeLabel } from './recordLabels';
