import { describe, expect, it } from 'vitest';
import type { Exercise } from './types';
import { workoutEditSnapshot, type WorkoutEditFields } from './workoutEditChanges';
import { createWorkoutSet } from './workoutSets';

const bench = { id: 'bench', name: 'Bench press', kind: 'strength' } as Exercise;

function fields(overrides: Partial<WorkoutEditFields> = {}): WorkoutEditFields {
  return {
    name: 'Upper A',
    workoutDate: '2026-11-17',
    category: 'upper',
    customTypeId: null,
    notes: '',
    durationMinutes: 52,
    startTime: '17:05',
    endTime: '17:57',
    movements: [
      {
        key: 'row-key',
        exercise: bench,
        notes: '',
        machinePhotoIds: [],
        machinePhotosInitialized: true,
        supersetKey: null,
        isComplete: false,
        sets: [{ ...createWorkoutSet('strength'), key: 'set-key', weight_kg: 120, reps: 6 }],
      },
    ],
    ...overrides,
  };
}

describe('unsaved changes to a saved workout', () => {
  it('ignores row keys and on-screen state that Save does not write', () => {
    const opened = fields();
    const [movement] = opened.movements;
    const reopened = fields({
      movements: [
        {
          ...movement,
          key: 'another-key',
          isComplete: true,
          machinePhotosInitialized: false,
          sets: movement.sets.map((item) => ({
            ...item,
            key: 'another-set-key',
            fromPrevious: true,
            restRevealed: true,
          })),
        },
      ],
    });
    expect(workoutEditSnapshot(reopened)).toBe(workoutEditSnapshot(opened));
    // Trailing spaces in typed text are not saved either.
    expect(workoutEditSnapshot(fields({ name: 'Upper A ' }))).toBe(workoutEditSnapshot(opened));
  });

  it('notices a changed weight, a removed set, notes and the workout time', () => {
    const opened = workoutEditSnapshot(fields());
    const [movement] = fields().movements;
    const heavier = fields({
      movements: [{ ...movement, sets: [{ ...movement.sets[0], weight_kg: 125 }] }],
    });
    expect(workoutEditSnapshot(heavier)).not.toBe(opened);
    expect(workoutEditSnapshot(fields({ movements: [{ ...movement, sets: [] }] }))).not.toBe(
      opened,
    );
    expect(workoutEditSnapshot(fields({ notes: 'Felt strong' }))).not.toBe(opened);
    expect(workoutEditSnapshot(fields({ endTime: '18:05' }))).not.toBe(opened);
  });
});
