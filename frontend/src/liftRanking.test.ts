import { describe, expect, it } from 'vitest';
import {
  formatLiftBestSet,
  formatLiftEstimate,
  liftBestApprox,
  liftRankingName,
  liftRankingRowLabel,
} from './liftRanking';
import type { LiftRanking } from './types';

const sam: LiftRanking = {
  member: { id: 'sam', display_name: 'Sam', profile_photo_url: null },
  is_you: false,
  best: {
    exercise_id: 'bench',
    weight_kg: 100,
    reps: 5,
    estimated_1rm: 121,
    achieved_date: '2026-01-01',
    normalised: false,
  },
};

const you: LiftRanking = {
  member: { id: 'me', display_name: 'Owner', profile_photo_url: null },
  is_you: true,
  best: {
    exercise_id: 'bench',
    weight_kg: 95,
    reps: 5,
    estimated_1rm: 110.8,
    achieved_date: '2026-01-02',
    normalised: true,
  },
};

describe('liftRanking', () => {
  it('marks normalised machine lifts as approximate', () => {
    expect(liftBestApprox(sam.best)).toBe('');
    expect(liftBestApprox(you.best)).toBe('≈ ');
    expect(formatLiftEstimate(sam.best, 'kg')).toBe('121 kg');
    expect(formatLiftEstimate(you.best, 'kg')).toBe('≈ 110.8 kg');
    expect(formatLiftBestSet(sam.best, 'kg')).toBe('100 kg × 5');
    expect(formatLiftBestSet(you.best, 'kg')).toBe('≈ 95 kg × 5');
  });

  it('formats names and screen-reader labels for friends and yourself', () => {
    expect(liftRankingName(sam)).toBe('Sam');
    expect(liftRankingName(you)).toBe('You');
    expect(liftRankingRowLabel(sam, 1, 'kg', true)).toBe('1. Sam, 121 kg. Open profile');
    expect(liftRankingRowLabel(sam, 1, 'kg', false)).toBe('1. Sam, 121 kg');
    expect(liftRankingRowLabel(you, 2, 'kg', true)).toBe('2. You, ≈ 110.8 kg');
  });
});
