import { describe, expect, it } from 'vitest';
import { loggedOnlyWarmups, suggestedWorkingSetIndexes } from './workingSetCheck';

const warmup = (weight_kg: number | null, completed = true) => ({
  set_type: 'warmup' as const,
  warmup: true,
  failed: false,
  weight_kg,
  completed,
});
const working = (weight_kg: number | null, completed = true) => ({
  set_type: 'normal' as const,
  warmup: false,
  failed: false,
  weight_kg,
  completed,
});

describe('working set check', () => {
  it('flags logged sets that are all warm-ups, ignoring planned sets', () => {
    expect(loggedOnlyWarmups([warmup(20, false)])).toBe(false);
    expect(loggedOnlyWarmups([warmup(20), working(60, false)])).toBe(true);
    expect(loggedOnlyWarmups([warmup(20), working(60)])).toBe(false);
  });

  it('suggests the sets near the top weight, or everything after the first when unweighted', () => {
    const squat = [20, 40, 60, 80, 100, 110, 120].map((kg) => warmup(kg));
    expect(suggestedWorkingSetIndexes(squat)).toEqual([4, 5, 6]);
    expect(suggestedWorkingSetIndexes([warmup(null), warmup(null), warmup(null)])).toEqual([1, 2]);
    expect(suggestedWorkingSetIndexes([warmup(74), warmup(74)])).toEqual([1]);
    expect(suggestedWorkingSetIndexes([warmup(50)])).toEqual([0]);
  });
});
