import { describe, expect, it } from 'vitest';
import { loggedOnlyWarmups, warmupOnlyMovements, warmupSetLabel } from './workingSetCheck';

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

describe('the warm-ups-only reminder', () => {
  it('names strength exercises whose logged sets are all warm-ups, never cardio', () => {
    const movements = [
      {
        name: 'squat',
        exercise: { kind: 'strength' as const },
        sets: [warmup(60), working(80, false)],
      },
      { name: 'bench', exercise: { kind: 'strength' as const }, sets: [warmup(40), working(60)] },
      { name: 'row', exercise: { kind: 'cardio' as const }, sets: [warmup(null)] },
    ];
    expect(warmupOnlyMovements(movements).map((item) => item.name)).toEqual(['squat']);
  });

  it('describes each warm-up by what was entered', () => {
    expect(warmupSetLabel({ weight_kg: 60, reps: 10 }, 'kg', 1)).toBe('60 kg × 10');
    expect(warmupSetLabel({ weight_kg: null, reps: 10 }, 'kg', 1)).toBe('10 reps');
    expect(warmupSetLabel({ weight_kg: 60, reps: null }, 'kg', 1)).toBe('60 kg');
    expect(warmupSetLabel({ weight_kg: null, reps: null }, 'kg', 2)).toBe('Set 2');
  });
});
