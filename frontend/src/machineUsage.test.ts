import { describe, expect, it } from 'vitest';
import {
  hasLikelyDuplicateMachines,
  multiMachineExerciseId,
  similarMachineNames,
} from './machineUsage';
import type { TrackedWorkout } from './types';

const workout = (
  movements: { exercise: string; machines?: string[]; setMachine?: string }[],
  sample = false,
) =>
  ({
    is_sample: sample,
    movements: movements.map((movement) => ({
      exercise: { id: movement.exercise },
      machine_photos: (movement.machines ?? []).map((id) => ({ id })),
      sets: movement.setMachine ? [{ machine_photo_id: movement.setMachine }] : [],
    })),
  }) as unknown as TrackedWorkout;

describe('multiMachineExerciseId', () => {
  it('names the exercise logged on two machines, most sessions first', () => {
    expect(
      multiMachineExerciseId([
        workout([{ exercise: 'leg-press', machines: ['hammer'] }]),
        workout([{ exercise: 'leg-press', machines: ['cybex'] }]),
        workout([{ exercise: 'chest-press', machines: ['technogym'] }]),
        workout([{ exercise: 'chest-press', machines: ['life'] }]),
        workout([{ exercise: 'chest-press', machines: ['technogym'] }]),
      ]),
    ).toBe('chest-press');
  });

  it('counts a machine pinned to a set, and ignores sample workouts and single machines', () => {
    expect(
      multiMachineExerciseId([
        workout([{ exercise: 'row', machines: ['a'] }]),
        workout([{ exercise: 'row', setMachine: 'b' }]),
      ]),
    ).toBe('row');
    expect(
      multiMachineExerciseId([
        workout([{ exercise: 'row', machines: ['a'] }]),
        workout([{ exercise: 'row', machines: ['a'] }]),
        workout([{ exercise: 'curl', machines: ['x'] }], true),
        workout([{ exercise: 'curl', machines: ['y'] }], true),
        workout([{ exercise: 'squat' }]),
      ]),
    ).toBeNull();
  });
});

describe('duplicate machine names', () => {
  it.each([
    ['Technogym Chest Press', 'Technogym chest press (old photo)'],
    ['Hammer Strength Leg Press', 'hammer strength leg press'],
    ['Cybex Row', 'Cybex Row machine'],
  ])('treats %s and %s as the same machine', (first, second) => {
    expect(similarMachineNames(first, second)).toBe(true);
  });

  it.each([
    ['Technogym Chest Press', 'Life Fitness Chest Press'],
    ['Hammer Leg Press', 'Cybex Leg Press'],
    ['A', 'A'],
    ['', 'Old photo'],
  ])('keeps %s and %s apart', (first, second) => {
    expect(similarMachineNames(first, second)).toBe(false);
  });

  it('finds a likely duplicate anywhere among the saved machines', () => {
    expect(
      hasLikelyDuplicateMachines([
        'Technogym Chest Press',
        'Life Fitness Chest Press',
        'Technogym chest press (old photo)',
      ]),
    ).toBe(true);
    expect(hasLikelyDuplicateMachines(['Technogym Chest Press', 'Life Fitness Chest Press'])).toBe(
      false,
    );
    expect(hasLikelyDuplicateMachines(['Technogym Chest Press'])).toBe(false);
  });
});
