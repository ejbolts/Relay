import { describe, expect, it } from 'vitest';
import { bodyweightContext, bodyweightOn, relativeStrength } from './relativeStrength';
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
