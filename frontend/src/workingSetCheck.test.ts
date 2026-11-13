import { describe, expect, it } from 'vitest';
import {
  loggedOnlyWarmups,
  needsWorkingSetNudge,
  setPositionsLabel,
  suggestedWorkingSetIndexes,
} from './workingSetCheck';

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
  it('nudges once two warm-ups are logged and no set is a working set', () => {
    expect(needsWorkingSetNudge([warmup(20), warmup(40, false)])).toBe(false);
    expect(needsWorkingSetNudge([warmup(20), warmup(40), warmup(60, false)])).toBe(true);
    expect(needsWorkingSetNudge([warmup(20), warmup(40), working(60, false)])).toBe(false);
  });

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

  it('labels set positions', () => {
    expect(setPositionsLabel([3])).toBe('set 4');
    expect(setPositionsLabel([4, 5, 6])).toBe('sets 5–7');
    expect(setPositionsLabel([1, 3])).toBe('2 sets');
  });
});
