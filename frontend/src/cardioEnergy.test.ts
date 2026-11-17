import { describe, expect, it } from 'vitest';
import { fatEnergyEquivalent, parseCardioCalories } from './cardioEnergy';

describe('cardio calorie logging', () => {
  it('distinguishes unlogged calories from an explicit zero', () => {
    expect(parseCardioCalories('')).toBeNull();
    expect(parseCardioCalories('  ')).toBeNull();
    expect(parseCardioCalories('0')).toBe(0);
    expect(parseCardioCalories('350')).toBe(350);
  });
  it.each(['-1', '350.5', 'NaN', 'Infinity', '100001'])('rejects invalid input %s', (value) => {
    expect(() => parseCardioCalories(value)).toThrow();
  });
  it('formats the energy comparison consistently across grams and kilograms', () => {
    expect(fatEnergyEquivalent(770)).toBe('100 g');
    expect(fatEnergyEquivalent(7700)).toBe('1 kg');
    expect(fatEnergyEquivalent(11550)).toBe('1.5 kg');
    expect(fatEnergyEquivalent(0)).toBe('0 g');
    expect(fatEnergyEquivalent(1)).toBe('<1 g');
  });
});
