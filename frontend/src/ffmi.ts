import type { BodyMeasurement, FfmiProfile } from './types';

/**
 * Fat-free mass index and natural muscular potential, matching Menno Henselmans' FFMI
 * calculator. Men use the height-normalised FFMI (Kouri et al. 1995); women use FFMI / 0.81.
 * Men's natural maximum lean mass follows Casey Butt's wrist and ankle model; women's uses a
 * maximum FFMI of 20 (Chappell et al. 2018).
 */

const KG_TO_LB = 2.20462;
const CM_PER_INCH = 2.54;

export const FFMI_SCALE_MIN = 17;
export const FFMI_SCALE_MAX = 29;

export const FFMI_COMPARISON: readonly { value: number; label: string }[] = [
  { value: 18.9, label: 'Population average' },
  { value: 21.8, label: 'Competitive power athlete' },
  { value: 22.6, label: 'Internationally competitive bodybuilder' },
  { value: 24.8, label: 'Average steroid user' },
  { value: 24.9, label: 'Upper-range natural reference' },
  { value: 25.4, label: 'World class natural pro bodybuilder' },
  { value: 28.0, label: 'Exceptional reported natural case' },
];

/** 24.8 sits on top of 24.9, so only the legend names it. */
export const FFMI_UNLABELLED_TICKS = new Set([24.8]);

/** Neighbours too close to label on the same side of a phone-width scale. */
export const FFMI_TICK_LABELS_BELOW = new Set([22.6, 25.4]);

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

/** Normalised FFMI for men, gender-adjusted FFMI for women. */
export function ffmiScore(
  sex: 'male' | 'female',
  heightCm: number,
  weightKg: number,
  bodyFatPct: number,
): number {
  const heightM = heightCm / 100;
  const raw = (weightKg * (1 - bodyFatPct / 100)) / (heightM * heightM);
  return roundOne(sex === 'male' ? raw + 6.1 * (1.8 - heightM) : raw / 0.81);
}

/** Maximum natural lean body mass in kg at the target body fat, or null without frame sizes. */
export function maxLeanMassKg(profile: FfmiProfile): number | null {
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

export interface FfmiPotential {
  maxFfmi: number;
  maxLeanMassKg: number;
  maxBodyweightKg: number;
  leanMassLeftKg: number;
}

export function naturalPotential(
  profile: FfmiProfile,
  measurement: Pick<BodyMeasurement, 'weight_kg' | 'body_fat_pct'>,
): FfmiPotential | null {
  const lean = maxLeanMassKg(profile);
  if (lean === null || !profile.sex || !profile.height_cm) return null;
  const heightM = profile.height_cm / 100;
  const raw = lean / (heightM * heightM);
  const currentLean = measurement.weight_kg * (1 - (measurement.body_fat_pct ?? 0) / 100);
  return {
    maxFfmi: roundOne(profile.sex === 'male' ? raw + 6.1 * (1.8 - heightM) : raw / 0.81),
    maxLeanMassKg: lean,
    maxBodyweightKg: roundOne(lean / (1 - profile.target_body_fat_pct / 100)),
    leanMassLeftKg: roundOne(lean - currentLean),
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
export function ffmiScalePercent(value: number): number {
  const percent = ((value - FFMI_SCALE_MIN) / (FFMI_SCALE_MAX - FFMI_SCALE_MIN)) * 100;
  return Math.min(100, Math.max(0, percent));
}

export function lengthFromCm(cm: number, unit: 'kg' | 'lb'): number {
  return unit === 'lb' ? roundOne(cm / CM_PER_INCH) : roundOne(cm);
}

export function lengthToCm(value: number, unit: 'kg' | 'lb'): number {
  return unit === 'lb' ? value * CM_PER_INCH : value;
}
