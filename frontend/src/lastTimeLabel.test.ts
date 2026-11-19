import { describe, expect, it } from 'vitest';
import { lastTimeLabel } from './lastTimeLabel';
import type { TrackedSet, WorkoutSetInput } from './types';

const set = (weight: number | null, reps: number, extra: Partial<TrackedSet> = {}) =>
  ({
    weight_kg: weight,
    reps,
    set_type: 'normal',
    warmup: false,
    failed: false,
    completed: true,
    ...extra,
  }) as TrackedSet;
const row = (weight: number | null, reps: number | null, completed = false) =>
  ({ ...set(weight, reps ?? 0), reps, completed }) as WorkoutSetInput;

describe('lastTimeLabel', () => {
  const sessions = [{ sets: [set(100, 7), set(100, 6), set(100, 5)] }];

  it("shows last time's matching set under a planned row that differs from it", () => {
    const rows = [row(100, 8), row(100, 8), row(100, 8)];
    expect(rows.map((_, index) => lastTimeLabel(rows, index, sessions, 'kg'))).toEqual([
      '100×7',
      '100×6',
      '100×5',
    ]);
  });

  it('stays quiet for rows that repeat last time, ticked rows and rows beyond it', () => {
    const rows = [row(100, 7), row(102.5, 6, true), row(100, 5), row(100, 5)];
    expect(rows.map((_, index) => lastTimeLabel(rows, index, sessions, 'kg'))).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('skips a session cut short to warm-ups, and shows bodyweight sets as reps', () => {
    const cutShort = { sets: [set(60, 10, { set_type: 'warmup', warmup: true })] };
    expect(lastTimeLabel([row(100, 8)], 0, [cutShort, ...sessions], 'kg')).toBe('100×7');
    expect(lastTimeLabel([row(null, 12)], 0, [{ sets: [set(null, 10)] }], 'kg')).toBe('10 reps');
  });

  it("uses the lifter's unit", () => {
    expect(lastTimeLabel([row(100, 8)], 0, sessions, 'lb')).toBe('220.46×7');
  });
});
