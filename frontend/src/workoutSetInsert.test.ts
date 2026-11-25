import { describe, expect, it } from 'vitest';
import type { Exercise } from './types';
import type { WorkoutDraftMovement, WorkoutDraftSet } from './workoutMovements';
import { movementWithAddedSet } from './workoutSetInsert';

const exercise: Exercise = {
  id: 'squat',
  name: 'Back Squat',
  category: 'lower',
  kind: 'strength',
  muscle_group: 'Quads',
  equipment: 'barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};

function set(key: string, values: Partial<WorkoutDraftSet> = {}): WorkoutDraftSet {
  return {
    key,
    reps: 5,
    weight_kg: 100,
    rpe: null,
    rest_seconds: 150,
    duration_seconds: null,
    distance_km: null,
    notes: null,
    set_type: 'normal',
    warmup: false,
    failed: false,
    completed: true,
    ...values,
  };
}

function movement(sets: WorkoutDraftSet[]): WorkoutDraftMovement {
  return {
    key: 'm1',
    exercise,
    notes: '',
    machinePhotoIds: [],
    machinePhotosInitialized: true,
    supersetKey: null,
    isComplete: true,
    sets,
  };
}

describe('adding a set', () => {
  it('adds at the end by default, copying the last set with its rest showing', () => {
    const next = movementWithAddedSet(
      movement([set('a'), set('b', { weight_kg: 110 })]),
      90,
      'new',
    );
    expect(next.isComplete).toBe(false);
    expect(next.sets.map((item) => item.key)).toEqual(['a', 'b', 'new']);
    expect(next.sets[2]).toMatchObject({
      weight_kg: 110,
      completed: false,
      fromPrevious: true,
      restRevealed: true,
    });
  });

  it('slots a set in between two sets, copying the one above and hiding its rest', () => {
    const next = movementWithAddedSet(
      movement([set('a', { weight_kg: 80 }), set('b', { weight_kg: 110 })]),
      90,
      'new',
      1,
    );
    expect(next.sets.map((item) => item.key)).toEqual(['a', 'new', 'b']);
    expect(next.sets[1]).toMatchObject({ weight_kg: 80, restRevealed: false });
  });

  it('copies set 1 for a set added at the start, and keeps the position in range', () => {
    const start = movementWithAddedSet(movement([set('a', { weight_kg: 80 })]), 90, 'new', 0);
    expect(start.sets.map((item) => item.key)).toEqual(['new', 'a']);
    expect(start.sets[0].weight_kg).toBe(80);
    const past = movementWithAddedSet(movement([set('a')]), 90, 'new', 9);
    expect(past.sets.map((item) => item.key)).toEqual(['a', 'new']);
  });
});
