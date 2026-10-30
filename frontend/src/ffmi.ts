import type { BodyMeasurement, FfmiProfile } from './types';

/** Standard FFMI and optional model estimates. Reference provenance: docs/FFMI-REFERENCES.md. */
const KG_TO_LB = 2.20462;
const CM_PER_INCH = 2.54;

type Sex = 'male' | 'female';

/** Raw FFMI percentiles from the same young-adult population sample, not training levels. */
export function ffmiComparisons(sex: Sex) {
  const values = sex === 'male' ? [16.8, 18.9, 21.1] : [13.8, 15.4, 17.6];
  return values.map((value, index) => ({
    value,
    percentile: [5, 50, 95][index],
    label: ['Population 5th percentile', 'Population median', 'Population 95th percentile'][index],
  }));
}

/** Display limits, not biological thresholds; expand to include scores outside the usual view. */
export function ffmiScaleRange(sex: Sex, score: number) {
  const [low, high] = sex === 'male' ? [14, 28] : [11, 23];
  return {
    min: Math.max(0, Math.floor(Math.min(low, score - 1))),
    max: Math.ceil(Math.max(high, score + 1)),
  };
}

export const DEFAULT_FFMI_PROFILE: FfmiProfile = {
  sex: null,
  height_cm: null,
  wrist_cm: null,
  ankle_cm: null,
  target_body_fat_pct: 10,
};

export function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function rawFfmi(heightCm: number, weightKg: number, bodyFatPct: number): number {
  return (weightKg * (1 - bodyFatPct / 100)) / (heightCm / 100) ** 2;
}

/** Conventional, unadjusted FFMI for either sex. Sex selects reference data only. */
export function ffmiScore(heightCm: number, weightKg: number, bodyFatPct: number): number {
  return roundOne(rawFfmi(heightCm, weightKg, bodyFatPct));
}

/** Optional male height adjustment. Never substituted for the chart's standard FFMI. */
export function maleHeightAdjustedFfmi(
  heightCm: number,
  weightKg: number,
  bodyFatPct: number,
): number {
  return roundOne(rawFfmi(heightCm, weightKg, bodyFatPct) + 6.1 * (1.8 - heightCm / 100));
}

/** Illustrative sensitivity, not a confidence interval or a measurement-error estimate. */
export function ffmiSensitivity(heightCm: number, weightKg: number, bodyFatPct: number) {
  return {
    min: ffmiScore(heightCm, weightKg, Math.min(100, bodyFatPct + 3)),
    max: ffmiScore(heightCm, weightKg, Math.max(0, bodyFatPct - 3)),
  };
}

/** Optional lean-mass model in kg at target body fat; not a personal genetic ceiling. */
export function referenceLeanMassKg(profile: FfmiProfile): number | null {
  const { sex, height_cm: height, wrist_cm: wrist, ankle_cm: ankle } = profile;
  if (!sex || !height) return null;
  const heightM = height / 100;
  if (sex === 'female') return roundOne(20 * heightM * heightM);
  if (!wrist || !ankle) return null;
  const leanLb =
    (height / CM_PER_INCH) *
    (wrist / CM_PER_INCH / 7.2546 + ankle / CM_PER_INCH / 5.9772) *
    (profile.target_body_fat_pct / 450 + 1);
  return roundOne(leanLb / KG_TO_LB);
}

export interface FfmiFrameEstimate {
  ffmi: number;
  leanMassKg: number;
  bodyweightKg: number;
  leanMassGapKg: number;
}

export function frameEstimate(
  profile: FfmiProfile,
  measurement: Pick<BodyMeasurement, 'weight_kg' | 'body_fat_pct'>,
): FfmiFrameEstimate | null {
  const lean = referenceLeanMassKg(profile);
  if (lean === null || !profile.sex || !profile.height_cm) return null;
  const heightM = profile.height_cm / 100;
  const raw = lean / (heightM * heightM);
  const currentLean = measurement.weight_kg * (1 - (measurement.body_fat_pct ?? 0) / 100);
  return {
    ffmi: roundOne(raw),
    leanMassKg: lean,
    bodyweightKg: roundOne(lean / (1 - profile.target_body_fat_pct / 100)),
    leanMassGapKg: roundOne(lean - currentLean),
  };
}

/** The newest check-in that recorded body fat, which FFMI needs. */
export function latestBodyFatMeasurement(measurements: BodyMeasurement[]): BodyMeasurement | null {
  return measurements.reduce<BodyMeasurement | null>(
    (latest, item) =>
      item.body_fat_pct !== null &&
      (latest === null || item.measurement_date > latest.measurement_date)
        ? item
        : latest,
    null,
  );
}

/** Position on the comparison scale, clamped to its ends. */
export function ffmiScalePercent(value: number, range: { min: number; max: number }): number {
  const percent = ((value - range.min) / (range.max - range.min)) * 100;
  return Math.min(100, Math.max(0, percent));
}

export function lengthFromCm(cm: number, unit: 'kg' | 'lb'): number {
  return unit === 'lb' ? roundOne(cm / CM_PER_INCH) : roundOne(cm);
}

export function lengthToCm(value: number, unit: 'kg' | 'lb'): number {
  return unit === 'lb' ? value * CM_PER_INCH : value;
}
