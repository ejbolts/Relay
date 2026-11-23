import { describe, expect, it } from 'vitest';
import {
  formatLiftBestSet,
  formatLiftEstimate,
  headToHeadScore,
  leaderOf,
  liftBarShare,
  liftRowSummary,
  MAX_HEAD_TO_HEAD_LIFTS,
  orderLiftsForPicker,
  toggleLiftSelection,
} from './liftComparisonDisplay';
import type { LiftBest, LiftComparison } from './types';

function best(estimated_1rm: number, exercise_id = 'ex', normalised = false): LiftBest {
  return {
    exercise_id,
    weight_kg: 100,
    reps: 5,
    estimated_1rm,
    achieved_date: '2026-01-01',
    normalised,
  };
}

function lift(name: string, yours: number | null, theirs: number | null): LiftComparison {
  return {
    exercise_id: `mine-${name}`,
    name,
    muscle_group: 'Chest',
    equipment: 'Barbell',
    yours: yours === null ? null : best(yours, `mine-${name}`),
    theirs: theirs === null ? null : best(theirs, `theirs-${name}`),
  };
}

describe('liftComparisonDisplay', () => {
  it('determines leader, bar share and overall score', () => {
    const squat = lift('Squat', 154, 140);
    const bench = lift('Bench', 116.7, 121);
    const row = lift('Row', 100, 100);
    const curl = lift('Curl', 40, null);
    const deadlift = lift('Deadlift', null, 200);

    expect([squat, bench, row, curl, deadlift].map(leaderOf)).toEqual([
      'you',
      'them',
      'level',
      null,
      null,
    ]);
    expect(liftBarShare(squat)).toBeCloseTo((154 / 294) * 100);
    expect(liftBarShare(curl)).toBeNull();

    const score = headToHeadScore([squat, bench, row, curl, deadlift], 'Sam');
    expect(score).toEqual({
      yours: 1,
      theirs: 1,
      level: 1,
      scored: 3,
      label: 'You lead 1 lift, Sam leads 1 lift, 1 lift level',
    });

    const withoutLevel = headToHeadScore([squat, bench], 'Sam');
    expect(withoutLevel.label).toBe('You lead 1 lift, Sam leads 1 lift');
  });

  it('formats estimates, best sets, normalised prefix and row summaries', () => {
    const normal = best(116.7, 'a', false);
    const approx = best(80, 'b', true);
    expect(formatLiftEstimate(normal, 'kg')).toBe('116.7 kg');
    expect(formatLiftEstimate(approx, 'kg')).toBe('≈ 80 kg');
    expect(formatLiftBestSet(normal, 'kg')).toBe('100 kg × 5');
    expect(formatLiftBestSet(approx, 'kg')).toBe('≈ 100 kg × 5');

    const bench = lift('Bench', 116.7, 121);
    const curl = lift('Curl', 40, null);
    expect(liftRowSummary(bench, 'Sam', 'kg')).toBe('Bench: you 116.7 kg, Sam 121 kg');
    expect(liftRowSummary(curl, 'Sam', 'kg')).toBe('Curl: you 40 kg, Sam no sets yet');
  });

  it('orders picker lifts: selected first, then both, theirs, yours, neither', () => {
    const lifts = [
      lift('Unlogged', null, null),
      lift('Curl', 40, null),
      lift('Deadlift', null, 200),
      lift('Squat', 154, 140),
      lift('Bench', 116.7, 121),
      lift('Row', 100, 100),
    ];
    const ordered = orderLiftsForPicker(lifts, ['mine-Row']);
    expect(ordered.map((item) => item.name)).toEqual([
      'Row',
      'Bench',
      'Squat',
      'Deadlift',
      'Curl',
      'Unlogged',
    ]);
  });

  it('toggles lifts and enforces the maximum cap', () => {
    let selected: string[] = [];
    for (let i = 0; i < MAX_HEAD_TO_HEAD_LIFTS + 3; i += 1) {
      selected = toggleLiftSelection(selected, `ex-${i}`);
    }
    expect(selected).toHaveLength(MAX_HEAD_TO_HEAD_LIFTS);
    expect(toggleLiftSelection(selected, 'ex-0')).toHaveLength(MAX_HEAD_TO_HEAD_LIFTS - 1);
  });
});
