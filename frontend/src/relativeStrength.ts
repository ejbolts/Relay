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
