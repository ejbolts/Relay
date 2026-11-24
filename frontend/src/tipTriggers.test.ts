import { describe, expect, it } from 'vitest';
import {
  machineTipEligible,
  readdsRemovedSet,
  replacesRemovedExercise,
  savedWorkoutCount,
  TIP_REMOVAL_WINDOW_MS,
  type TipRemoval,
} from './tipTriggers';

const NOW = 1_000_000;
const exerciseRemoved: TipRemoval = { kind: 'exercise', key: 'bench', at: NOW - 1000 };
const setRemoved: TipRemoval = { kind: 'set', key: 'bench', at: NOW - 1000 };

const workout = (exerciseId: string, photos = 0, sample = false) => ({
  is_sample: sample,
  movements: [{ exercise: { id: exerciseId }, machine_photos: Array(photos).fill({}) }],
});

describe('tip triggers', () => {
  it('reads choosing exercises soon after removing one as replacing it', () => {
    expect(replacesRemovedExercise(exerciseRemoved, 1, 5, NOW)).toBe(true);
    expect(replacesRemovedExercise(exerciseRemoved, 0, 5, NOW)).toBe(false);
    expect(replacesRemovedExercise(exerciseRemoved, 1, 4, NOW)).toBe(false);
    expect(replacesRemovedExercise(exerciseRemoved, 1, 5, NOW + TIP_REMOVAL_WINDOW_MS)).toBe(false);
    // The latest removal was a set, so the exercise removed before it no longer counts.
    expect(replacesRemovedExercise(setRemoved, 1, 5, NOW)).toBe(false);
    expect(replacesRemovedExercise(null, 1, 5, NOW)).toBe(false);
  });

  it('reads a set added to the exercise a set was just deleted from as reordering', () => {
    expect(readdsRemovedSet(setRemoved, 'bench', NOW)).toBe(true);
    expect(readdsRemovedSet(setRemoved, 'row', NOW)).toBe(false);
    expect(readdsRemovedSet(exerciseRemoved, 'bench', NOW)).toBe(false);
    expect(readdsRemovedSet(setRemoved, 'bench', NOW + TIP_REMOVAL_WINDOW_MS)).toBe(false);
  });

  it('suits the machine tip to a machine or cable exercise logged three times without a photo', () => {
    const cable = { id: 'row', equipment: 'Cable' };
    const three = [workout('row'), workout('row'), workout('row')];
    expect(machineTipEligible(cable, three)).toBe(true);
    expect(machineTipEligible({ id: 'row', equipment: 'Barbell' }, three)).toBe(false);
    expect(machineTipEligible(cable, three.slice(1))).toBe(false);
    // Sample workouts don't count towards the three...
    expect(machineTipEligible(cable, [...three.slice(1), workout('row', 0, true)])).toBe(false);
    // ...but a photo in any workout, sample ones included, means it is already known.
    expect(machineTipEligible(cable, [...three, workout('row', 1, true)])).toBe(false);
    expect(savedWorkoutCount([workout('row'), workout('row', 0, true)])).toBe(1);
  });
});
