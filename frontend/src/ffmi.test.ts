import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FFMI_PROFILE,
  ffmiScalePercent,
  ffmiScore,
  latestBodyFatMeasurement,
  lengthFromCm,
  lengthToCm,
  maxLeanMassKg,
  naturalPotential,
} from './ffmi';
import type { BodyMeasurement, FfmiProfile } from './types';

const male = (overrides: Partial<FfmiProfile> = {}): FfmiProfile => ({
  ...DEFAULT_FFMI_PROFILE,
  sex: 'male',
  ...overrides,
});

const checkIn = (date: string, bodyFat: number | null, weight = 80): BodyMeasurement => ({
  id: date,
  measurement_date: date,
  weight_kg: weight,
  body_fat_pct: bodyFat,
  notes: null,
  is_sample: false,
  created_at: `${date}T08:00:00Z`,
});

// Expected values were read from mennohenselmans.com/ffmi-calculator with the same inputs.
describe('ffmiScore', () => {
  it.each([
    ['male', 196, 83.8, 8.2, 19],
    ['male', 160, 72.2, 23, 22.9],
    ['male', 179, 112.9, 23.3, 27.1],
    ['female', 193, 64, 20.8, 16.8],
    ['female', 158, 55, 20.4, 21.7],
  ] as const)(
    'scores a %s at %s cm, %s kg and %s%% fat as %s',
    (sex, height, weight, fat, score) => {
      expect(ffmiScore(sex, height, weight, fat)).toBe(score);
    },
  );
});

describe('naturalPotential', () => {
  it('estimates a woman from height alone', () => {
    expect(
      naturalPotential(
        { ...DEFAULT_FFMI_PROFILE, sex: 'female', height_cm: 158, target_body_fat_pct: 8 },
        { weight_kg: 55, body_fat_pct: 20.4 },
      ),
    ).toEqual({ maxFfmi: 24.7, maxLeanMassKg: 49.9, maxBodyweightKg: 54.2, leanMassLeftKg: 6.1 });
  });

  it.each([
    [160, 16.2, 20.6, 13, 72.2, 23, { maxFfmi: 26.9, lean: 65.7, max: 75.5, left: 10.1 }],
    [159, 17.3, 22.3, 7, 67.3, 19.6, { maxFfmi: 28.7, lean: 69.4, max: 74.6, left: 15.3 }],
  ])(
    'follows the wrist and ankle model for a %s cm man',
    (height, wrist, ankle, target, weight, fat, expected) => {
      const potential = naturalPotential(
        male({ height_cm: height, wrist_cm: wrist, ankle_cm: ankle, target_body_fat_pct: target }),
        { weight_kg: weight, body_fat_pct: fat },
      )!;
      // The site converts pounds with 2.20642 rather than 2.20462, so allow its 0.1 kg rounding.
      expect(Math.abs(potential.maxLeanMassKg - expected.lean)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(potential.maxBodyweightKg - expected.max)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(potential.leanMassLeftKg - expected.left)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(potential.maxFfmi - expected.maxFfmi)).toBeLessThanOrEqual(0.1);
    },
  );

  it('needs wrist and ankle sizes for men', () => {
    expect(maxLeanMassKg(male({ height_cm: 180, wrist_cm: 17 }))).toBeNull();
    expect(
      naturalPotential(male({ height_cm: 180 }), { weight_kg: 80, body_fat_pct: 12 }),
    ).toBeNull();
  });
});

describe('FFMI helpers', () => {
  it('uses the newest check-in that has body fat', () => {
    const measurements = [
      checkIn('2026-10-20', null),
      checkIn('2026-10-12', 14),
      checkIn('2026-10-15', 13),
    ];
    expect(latestBodyFatMeasurement(measurements)?.id).toBe('2026-10-15');
    expect(latestBodyFatMeasurement([checkIn('2026-10-20', null)])).toBeNull();
  });

  it('clamps positions to the 17 to 29 scale', () => {
    expect(ffmiScalePercent(17)).toBe(0);
    expect(ffmiScalePercent(23)).toBe(50);
    expect(ffmiScalePercent(15)).toBe(0);
    expect(ffmiScalePercent(31)).toBe(100);
  });

  it('shows lengths in inches for pound users', () => {
    expect(lengthFromCm(177.8, 'lb')).toBe(70);
    expect(lengthToCm(70, 'lb')).toBeCloseTo(177.8);
    expect(lengthFromCm(180, 'kg')).toBe(180);
  });
});
