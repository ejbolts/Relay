import { describe, expect, it } from 'vitest';
import {
  formatWeight,
  recordDisplayValue,
  weightFromKg,
  weightInputKg,
  weightInputValue,
  weightToKg,
} from './weightUnits';
import { formatVolume, setLabel } from './trainingSummary';
import { fatEnergyEquivalent } from './cardioEnergy';

describe('preferred weight units and canonical storage', () => {
  it('saves equivalent strength, bodyweight and goal entries in kg', () => {
    const pounds = 220.46226218;
    expect(weightInputKg('100', 'kg')).toBe(100);
    expect(weightInputKg(String(pounds), 'lb')).toBeCloseTo(100, 10);
    expect(weightInputKg('185,19', 'lb')).toBeCloseTo(84.000771, 6);
    expect(weightInputKg('0', 'lb')).toBe(0);
    expect(weightInputKg('', 'lb')).toBeNull();
    expect(weightInputKg('.', 'lb')).toBeNull();
    expect(weightToKg(weightFromKg(84.237123, 'lb'), 'lb')).toBeCloseTo(84.237123, 10);
  });

  it.each([84.237123, 100, 0, 181.436948])(
    'preserves %s kg exactly through an unchanged edit and kg → lb → kg switch',
    (original) => {
      const record = { weight_kg: original, reps: 5, bodyweight_kg: original };
      let draftKg = original;
      for (const unit of ['kg', 'lb', 'kg', 'lb', 'kg'] as const) {
        const displayed = weightInputValue(draftKg, unit);
        draftKg = weightInputKg(displayed, unit, draftKg)!;
        // Saving an unchanged form must preserve precise values, not the rounded display.
        const payload = { ...record, weight_kg: draftKg, bodyweight_kg: draftKg };
        expect(payload).toEqual(record);
        expect(weightInputKg(Number(displayed).toFixed(4), unit, draftKg)).toBe(draftKg);
      }
      expect(record.weight_kg).toBe(original);
    },
  );

  it('converts a changed pound edit once while keeping an unchanged rounded value exact', () => {
    const originalKg = 84.237123;
    expect(weightInputValue(originalKg, 'lb')).toBe('185.71');
    expect(weightInputKg('185.710', 'lb', originalKg)).toBe(originalKg);
    const editedKg = weightInputKg('190', 'lb', originalKg)!;
    expect(editedKg).toBeCloseTo(86.1825503, 6);
    expect(weightInputKg('190', 'lb', editedKg)).toBe(editedKg);
    expect(weightInputKg(weightInputValue(editedKg, 'kg'), 'kg', editedKg)).toBe(editedKg);
  });

  it('displays PR response units without double-converting and retains non-weight units', () => {
    expect(recordDisplayValue({ value: 220.5, unit: 'lb' }, 'lb')).toBe('220.5 lb');
    expect(recordDisplayValue({ value: 100, unit: 'kg' }, 'lb')).toBe('220.5 lb');
    expect(recordDisplayValue({ value: 220.46226218, unit: 'lb' }, 'kg')).toBe('100 kg');
    expect(recordDisplayValue({ value: 8, unit: 'reps' }, 'lb')).toBe('8 reps');
  });

  it('labels sets, volume and derived weight in pounds without changing the source values', () => {
    const set = { weight_kg: 100, reps: 5 };
    expect(formatWeight(set.weight_kg, 'lb')).toBe('220.46 lb');
    expect(setLabel(set, 'lb')).toBe('220.46 lb × 5');
    expect(formatVolume(12_000, 'lb')).toBe('26,455 lb');
    expect(formatVolume(12_000, 'kg')).toBe('12.0 t');
    expect(fatEnergyEquivalent(7700, 'lb')).toBe('2.2 lb');
    expect(fatEnergyEquivalent(1, 'lb')).toBe('<0.01 lb');
    expect(set).toEqual({ weight_kg: 100, reps: 5 });
  });
});
