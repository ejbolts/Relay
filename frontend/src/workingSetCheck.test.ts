import { describe, expect, it } from 'vitest';
import { loggedOnlyWarmups } from './workingSetCheck';

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
});
