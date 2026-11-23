import type { BodyMeasurement } from './types';
import { formatWeight, type WeightUnit } from './weightUnits';

export function bodyweightOn(
  measurements: Pick<BodyMeasurement, 'measurement_date' | 'weight_kg'>[],
  day: string,
  recorded?: number | null,
): number | null {
  if (recorded != null) return Number.isFinite(recorded) && recorded > 0 ? recorded : null;
  let latest: (typeof measurements)[number] | undefined;
  for (const measurement of measurements) {
    if (
      measurement.measurement_date <= day &&
      (!latest || measurement.measurement_date > latest.measurement_date)
    )
      latest = measurement;
  }
  return latest?.weight_kg ?? null;
}

export function relativeStrength(
  weight?: number | null,
  bodyweight?: number | null,
): number | null {
  if (
    weight == null ||
    bodyweight == null ||
    !Number.isFinite(weight) ||
    !Number.isFinite(bodyweight) ||
    weight <= 0 ||
    bodyweight <= 0
  )
    return null;
  return Math.round((weight / bodyweight) * 10_000) / 10_000;
}

export function bodyweightContext(
  weight: number | null | undefined,
  bodyweight: number | null | undefined,
  unit: WeightUnit,
): string {
  if (bodyweight == null || bodyweight <= 0 || !Number.isFinite(bodyweight)) return '';
  const ratio = relativeStrength(weight, bodyweight);
  return `${ratio !== null ? `${ratio.toFixed(2)}× BW · ` : ''}at ${formatWeight(bodyweight, unit)} BW`;
}

/**
 * The one bodyweight every item was logged at, or null when they differ or none recorded one.
 * Lets a list say it once instead of repeating it on every row.
 */
export function sharedBodyweight(items: { bodyweight_kg: number | null }[]): number | null {
  const recorded = [
    ...new Set(items.map((item) => item.bodyweight_kg).filter((kg) => kg !== null)),
  ];
  return recorded.length === 1 ? recorded[0] : null;
}

/**
 * The set an exercise's bodyweight ratio is said on: its heaviest logged set (the first of equal
 * ones), or null before any is logged. Callers leave cardio out.
 */
export function heaviestLoggedSetKey(
  sets: readonly { key: string; completed: boolean; weight_kg: number | null }[],
): string | null {
  let best: (typeof sets)[number] | null = null;
  for (const item of sets)
    if (item.completed && (best === null || (item.weight_kg ?? 0) > (best.weight_kg ?? 0)))
      best = item;
  return best?.key ?? null;
}

/**
 * The bodyweight a saved workout was logged at, as it was opened for editing: its first set that
 * recorded one. An editor keeps this for the whole edit, so removing a set never changes the
 * other rows' ratio or what new sets are stamped with.
 */
export function savedWorkoutBodyweight(
  workout: { movements: readonly { sets: readonly { bodyweight_kg?: number | null }[] }[] } | null,
): number | null {
  return (
    workout?.movements.flatMap((movement) => movement.sets).find((set) => set.bodyweight_kg != null)
      ?.bodyweight_kg ?? null
  );
}
