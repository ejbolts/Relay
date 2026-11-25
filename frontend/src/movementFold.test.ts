import { describe, expect, it } from 'vitest';
import { foldedMovementSummary, workingSetsDone } from './movementFold';
import type { WorkoutSetInput } from './types';

const set = (fields: Partial<WorkoutSetInput>): WorkoutSetInput =>
  ({
    completed: false,
    weight_kg: 60,
    reps: 8,
    set_type: 'working',
    warmup: false,
    ...fields,
  }) as WorkoutSetInput;

describe('folded exercise cards', () => {
  it('counts the logged working sets', () => {
    expect(foldedMovementSummary([set({ completed: true }), set({})], false)).toBe(
      '1 completed set',
    );
    expect(
      foldedMovementSummary(
        [
          set({ completed: true, set_type: 'warmup', warmup: true }),
          set({ completed: true }),
          set({ completed: true }),
        ],
        false,
      ),
    ).toBe('2 completed sets');
    expect(foldedMovementSummary([set({})], false)).toBe('0 completed sets');
  });

  it('counts warm-ups when only warm-ups were logged, except for cardio', () => {
    const warmups = [
      set({ completed: true, set_type: 'warmup', warmup: true }),
      set({ completed: true, set_type: 'warmup', warmup: true }),
      set({}),
    ];
    expect(foldedMovementSummary(warmups, false)).toBe('2 warm-up sets');
    expect(foldedMovementSummary(warmups.slice(0, 1), false)).toBe('1 warm-up set');
    expect(foldedMovementSummary(warmups, true)).toBe('0 completed sets');
  });

  it('is done once every working set is ticked', () => {
    expect(
      workingSetsDone([set({ completed: true }), set({ set_type: 'warmup', warmup: true })]),
    ).toBe(true);
    expect(workingSetsDone([set({ completed: true }), set({})])).toBe(false);
    expect(workingSetsDone([set({ set_type: 'warmup', warmup: true, completed: true })])).toBe(
      false,
    );
    expect(workingSetsDone([])).toBe(false);
  });
});
