import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FFMI_PROFILE,
  ffmiScalePercent,
  ffmiScore,
  latestBodyFatMeasurement,
  lengthFromCm,
  lengthToCm,
  referenceLeanMassKg,
  frameEstimate,
  ffmiComparisons,
  ffmiScaleRange,
  ffmiSensitivity,
  maleHeightAdjustedFfmi,
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

describe('ffmiScore', () => {
  it.each([
    [180, 80, 15, 21.0],
    [165, 60, 25, 16.5],
    [200, 100, 20, 20],
    [160, 64, 20, 20],
  ])('uses conventional FFMI for %s cm, %s kg and %s%% fat', (height, weight, fat, score) => {
    expect(ffmiScore(height, weight, fat)).toBe(score);
  });

  it('keeps male height adjustment separate from conventional FFMI', () => {
    expect(maleHeightAdjustedFfmi(200, 100, 20)).toBe(18.8);
    expect(maleHeightAdjustedFfmi(160, 64, 20)).toBe(21.2);
    expect(ffmiScore(200, 100, 20)).toBe(ffmiScore(160, 64, 20));
  });

  it('shows illustrative body-fat sensitivity and clamps physical endpoints', () => {
    expect(ffmiSensitivity(200, 100, 20)).toEqual({ min: 19.3, max: 20.8 });
    expect(ffmiSensitivity(200, 100, 2)).toEqual({ min: 23.8, max: 25 });
    expect(ffmiSensitivity(200, 100, 99)).toEqual({ min: 0, max: 1 });
  });
});

describe('frameEstimate', () => {
  it('estimates a woman from height alone', () => {
    expect(
      frameEstimate(
        { ...DEFAULT_FFMI_PROFILE, sex: 'female', height_cm: 158, target_body_fat_pct: 8 },
        { weight_kg: 55, body_fat_pct: 20.4 },
      ),
    ).toEqual({ ffmi: 20, leanMassKg: 49.9, bodyweightKg: 54.2, leanMassGapKg: 6.1 });
  });

  it.each([
    [160, 16.2, 20.6, 13, 72.2, 23, { ffmi: 25.7, lean: 65.7, max: 75.5, left: 10.1 }],
    [159, 17.3, 22.3, 7, 67.3, 19.6, { ffmi: 27.5, lean: 69.4, max: 74.6, left: 15.3 }],
  ])(
    'follows the wrist and ankle model for a %s cm man',
    (height, wrist, ankle, target, weight, fat, expected) => {
      const potential = frameEstimate(
        male({ height_cm: height, wrist_cm: wrist, ankle_cm: ankle, target_body_fat_pct: target }),
        { weight_kg: weight, body_fat_pct: fat },
      )!;
      // The site converts pounds with 2.20642 rather than 2.20462, so allow its 0.1 kg rounding.
      expect(Math.abs(potential.leanMassKg - expected.lean)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(potential.bodyweightKg - expected.max)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(potential.leanMassGapKg - expected.left)).toBeLessThanOrEqual(0.1);
      expect(potential.ffmi).toBe(expected.ffmi);
    },
  );

  it('needs wrist and ankle sizes for men', () => {
    expect(referenceLeanMassKg(male({ height_cm: 180, wrist_cm: 17 }))).toBeNull();
    expect(frameEstimate(male({ height_cm: 180 }), { weight_kg: 80, body_fat_pct: 12 })).toBeNull();
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

  it('uses matched male and female population percentiles without training ranks', () => {
    expect(ffmiComparisons('male').map((p) => p.value)).toEqual([16.8, 18.9, 21.1]);
    expect(ffmiComparisons('female').map((p) => p.value)).toEqual([13.8, 15.4, 17.6]);
    expect(ffmiComparisons('female').map((p) => p.label)).toEqual([
      'Population 5th percentile',
      'Population median',
      'Population 95th percentile',
    ]);
  });

  it('expands the display to contain low and high scores instead of hiding them at an edge', () => {
    expect(ffmiScaleRange('male', 21)).toEqual({ min: 14, max: 28 });
    expect(ffmiScaleRange('female', 15.4)).toEqual({ min: 11, max: 23 });
    expect(ffmiScaleRange('female', 9)).toEqual({ min: 8, max: 23 });
    expect(ffmiScaleRange('male', 40)).toEqual({ min: 14, max: 41 });
    expect(ffmiScaleRange('female', 0).min).toBe(0);
    expect(ffmiScalePercent(20, { min: 10, max: 30 })).toBe(50);
    expect(ffmiScalePercent(9, { min: 10, max: 30 })).toBe(0);
    expect(ffmiScalePercent(31, { min: 10, max: 30 })).toBe(100);
  });

  it('shows lengths in inches for pound users', () => {
    expect(lengthFromCm(177.8, 'lb')).toBe(70);
    expect(lengthToCm(70, 'lb')).toBeCloseTo(177.8);
    expect(lengthFromCm(180, 'kg')).toBe(180);
  });
});
