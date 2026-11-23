import { describe, expect, it } from 'vitest';
import {
  heaviestLoggedSetKey,
  savedWorkoutBodyweight,
  bodyweightContext,
  bodyweightOn,
  relativeStrength,
  sharedBodyweight,
} from './relativeStrength';
import { recordDisplayValue } from './weightUnits';

describe('dated relative strength', () => {
  const weights = [
    { measurement_date: '2026-01-20', weight_kg: 70 },
    { measurement_date: '2026-01-01', weight_kg: 90 },
    { measurement_date: '2026-01-15', weight_kg: 80 },
  ];
  it('uses the newest check-in on or before the lift, or its explicit snapshot', () => {
    expect(bodyweightOn(weights, '2026-01-16')).toBe(80);
    expect(bodyweightOn(weights, '2026-01-15')).toBe(80);
    expect(bodyweightOn(weights, '2025-12-31')).toBeNull();
    expect(bodyweightOn(weights, '2026-01-16', 85)).toBe(85);
    expect(bodyweightOn(weights, '2026-01-16', 0)).toBeNull();
  });
  it('compares canonical ratios and formats bodyweight context in either unit', () => {
    expect(relativeStrength(100, 80)).toBe(1.25);
    expect(relativeStrength(100.000001, 80)).toBe(1.25);
    expect(relativeStrength(90, 70)).toBe(1.2857);
    expect(bodyweightContext(100, 80, 'kg')).toBe('1.25× BW · at 80 kg BW');
    expect(bodyweightContext(100, 80, 'lb')).toBe('1.25× BW · at 176.37 lb BW');
    expect(recordDisplayValue({ value: 1.2857, unit: '× BW' }, 'lb')).toBe('1.29× BW');
  });
  it.each([null, 0, -1, NaN, Infinity])(
    'does not calculate from invalid bodyweight %s',
    (weight) => {
      expect(relativeStrength(100, weight)).toBeNull();
      expect(bodyweightContext(100, weight, 'kg')).toBe('');
    },
  );
});

describe('sharedBodyweight', () => {
  const at = (bodyweight_kg: number | null) => ({ bodyweight_kg });
  it('returns the single bodyweight a list was logged at', () => {
    expect(sharedBodyweight([at(82.5), at(82.5), at(null)])).toBe(82.5);
  });
  it('returns null when bodyweights differ or none was recorded', () => {
    expect(sharedBodyweight([at(82.5), at(83)])).toBeNull();
    expect(sharedBodyweight([at(null), at(null)])).toBeNull();
    expect(sharedBodyweight([])).toBeNull();
  });
});

describe('heaviestLoggedSetKey', () => {
  const set = (key: string, weight_kg: number | null, completed = true) => ({
    key,
    weight_kg,
    completed,
  });

  it('picks the heaviest logged set, the first of equal ones', () => {
    expect(heaviestLoggedSetKey([set('a', 80), set('b', 85), set('c', 85)])).toBe('b');
  });

  it('skips sets not yet logged', () => {
    expect(heaviestLoggedSetKey([set('a', 80), set('b', 100, false)])).toBe('a');
    expect(heaviestLoggedSetKey([set('a', 80, false)])).toBeNull();
  });

  it('treats a set with no weight as zero', () => {
    expect(heaviestLoggedSetKey([set('a', null), set('b', null)])).toBe('a');
  });
});

describe('savedWorkoutBodyweight', () => {
  const workout = (...weights: (number | null)[]) => ({
    movements: [{ sets: weights.map((bodyweight_kg) => ({ bodyweight_kg })) }],
  });

  it('takes the first set that recorded one', () => {
    expect(savedWorkoutBodyweight(workout(null, 80, 82))).toBe(80);
  });

  it('is null for a workout saved without one, or none at all', () => {
    expect(savedWorkoutBodyweight(workout(null, null))).toBeNull();
    expect(savedWorkoutBodyweight(null)).toBeNull();
  });
});
