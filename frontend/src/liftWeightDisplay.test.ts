import { describe, expect, it } from 'vitest';
import { formatLiftBestSet, formatLiftEstimate, liftBestApprox } from './liftWeightDisplay';
import type { LiftBest } from './types';
import { formatWeight } from './weightUnits';

function best(estimated_1rm: number, weight_kg: number, normalised: boolean): LiftBest {
  return {
    exercise_id: 'bench',
    weight_kg,
    reps: 5,
    estimated_1rm,
    achieved_date: '2026-01-01',
    normalised,
  };
}

describe('lift weight display', () => {
  it('marks normalised machine lifts as approximate', () => {
    expect(liftBestApprox(best(121, 100, false))).toBe('');
    expect(liftBestApprox(best(110.8, 95, true))).toBe('≈ ');
  });

  it('formats estimates to one decimal and best sets with their reps', () => {
    expect(formatLiftEstimate(best(116.7, 100, false), 'kg')).toBe('116.7 kg');
    expect(formatLiftEstimate(best(80, 100, true), 'kg')).toBe('≈ 80 kg');
    expect(formatLiftEstimate(best(110.8, 95, true), 'kg')).toBe('≈ 110.8 kg');
    expect(formatLiftBestSet(best(121, 100, false), 'kg')).toBe('100 kg × 5');
    expect(formatLiftBestSet(best(110.8, 95, true), 'kg')).toBe('≈ 95 kg × 5');
  });

  it('follows the user’s unit', () => {
    expect(formatLiftEstimate(best(100, 100, false), 'lb')).toBe(formatWeight(100, 'lb', 1));
    expect(formatLiftBestSet(best(100, 90, true), 'lb')).toBe(`≈ ${formatWeight(90, 'lb')} × 5`);
  });
});
