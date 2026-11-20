import { describe, expect, it } from 'vitest';
import {
  matchingLastSessionSet,
  withLastSessionReps,
  withLastSessionValues,
} from './lastSessionSet';

const warmup = { set_type: 'warmup' as const, warmup: true, failed: false };
const working = { set_type: 'normal' as const, warmup: false, failed: false };
const attempted = { set_type: 'normal' as const, warmup: false, failed: true };
const drop = { set_type: 'drop' as const, warmup: false, failed: false };

describe('matchingLastSessionSet', () => {
  const last = [
    { ...warmup, id: 'w1' },
    { ...working, id: 'n1' },
    { ...working, id: 'n2' },
    { ...attempted, id: 'n3' },
    { ...drop, id: 'd1' },
  ];

  it('lines each row up with the same kind of set in the same position', () => {
    const today = [warmup, working, working, working, drop];
    expect(today.map((_, index) => matchingLastSessionSet(today, index, last)?.id)).toEqual([
      'w1',
      'n1',
      'n2',
      'n3',
      'd1',
    ]);
  });

  it('matches planned rows without a warm-up to the working sets', () => {
    const planned = [working, working];
    expect(matchingLastSessionSet(planned, 0, last)?.id).toBe('n1');
    expect(matchingLastSessionSet(planned, 1, last)?.id).toBe('n2');
  });

  it('has nothing for rows beyond last time or without a row', () => {
    const today = [working, working, working, working];
    expect(matchingLastSessionSet(today, 3, last)).toBeUndefined();
    expect(matchingLastSessionSet(today, 9, last)).toBeUndefined();
  });
});

describe('withLastSessionReps', () => {
  const at = (
    weight_kg: number | null,
    reps: number | null,
    kind: typeof working | typeof warmup = working,
  ) => ({
    ...kind,
    weight_kg,
    reps,
  });
  const last = [at(40, 10, warmup), at(100, 7), at(100, 6), at(100, 5)];

  it("gives rows at last time's weight its reps, matched by kind and position", () => {
    const planned = [at(40, 12, warmup), at(100, 8), at(100, 8), at(100, 8)];
    expect(withLastSessionReps(planned, last).map((row) => row.reps)).toEqual([12, 7, 6, 5]);
  });

  it("keeps the plan's reps at a new weight, beyond last time, or when last time has none", () => {
    const planned = [at(102.5, 8), at(100, 8), at(100, 8), at(100, 8), at(100, 8)];
    const withoutReps = [at(40, 10, warmup), at(100, 7), at(100, 6), at(100, null)];
    expect(withLastSessionReps(planned, withoutReps).map((row) => row.reps)).toEqual([
      8, 6, 8, 8, 8,
    ]);
    expect(withLastSessionReps([at(null, 12)], [at(null, 15)])[0].reps).toBe(15);
    expect(withLastSessionReps([at(100, 8)], [])[0].reps).toBe(8);
  });
});

describe('withLastSessionValues', () => {
  const set = (
    kind: typeof working | typeof warmup,
    weight_kg: number | null,
    reps: number | null,
    rest_seconds: number | null,
  ) => ({ ...kind, weight_kg, reps, rest_seconds });

  it("fills a plan's blanks from the matching set, repeating the last of a kind beyond it", () => {
    const last = [set(warmup, 40, 10, 60), set(working, 100, 7, 150), set(working, 100, 6, 120)];
    const planned = [
      set(warmup, null, null, null),
      set(working, null, null, null),
      set(working, 90, 8, 200),
      set(working, null, null, null),
    ];
    expect(withLastSessionValues(planned, last, 180)).toEqual([
      set(warmup, 40, 10, 60),
      set(working, 100, 7, 150),
      set(working, 90, 8, 200),
      set(working, 100, 6, 120),
    ]);
  });

  it('gives a blank rest the default when there is no last time', () => {
    expect(withLastSessionValues([set(working, null, 8, null)], [], 180)).toEqual([
      set(working, null, 8, 180),
    ]);
    expect(withLastSessionValues([set(working, null, null, null)], [], null)).toEqual([
      set(working, null, null, null),
    ]);
  });
});
