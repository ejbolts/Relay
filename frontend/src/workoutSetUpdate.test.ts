import { describe, expect, it } from 'vitest';
import type { Exercise } from './types';
import type { WorkoutDraftMovement, WorkoutDraftSet } from './workoutMovements';
import { movementAfterSetUpdate, setUpdateEffects } from './workoutSetUpdate';

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
    completed: false,
    fromPrevious: true,
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
    isComplete: false,
    sets,
  };
}

describe('updating a set in a live workout', () => {
  it('reports the rest to start and whether the tick finishes the exercise', () => {
    const squat = movement([set('a', { completed: true }), set('b')]);
    expect(setUpdateEffects(squat, 'b', { completed: true }, false)).toEqual({
      loggingSet: true,
      finishesExercise: true,
      correctingLoggedSet: false,
      restSeconds: 150,
    });
    expect(setUpdateEffects(squat, 'b', { completed: true }, true).finishesExercise).toBe(false);
    expect(setUpdateEffects(squat, 'a', { reps: 6 }, false)).toMatchObject({
      loggingSet: false,
      correctingLoggedSet: true,
      restSeconds: null,
    });
  });

  it('records the bodyweight, folds a planned exercise and repeats the logged set', () => {
    const squat = movement([set('a'), set('b', { weight_kg: 90, reps: 5 })]);
    const afterFirst = movementAfterSetUpdate(
      squat,
      'a',
      { completed: true, weight_kg: 105 },
      { finishesExercise: false, suggestNext: true, addedByHand: false, workoutBodyweight: 82 },
    );
    expect(afterFirst.sets[0]).toMatchObject({
      completed: true,
      bodyweight_kg: 82,
      fromPrevious: false,
      restRevealed: true,
    });
    // The untouched suggestion after it now repeats what was just lifted.
    expect(afterFirst.sets[1]).toMatchObject({ weight_kg: 105, reps: 5, fromPrevious: true });
    expect(afterFirst.isComplete).toBe(false);

    const afterLast = movementAfterSetUpdate(
      afterFirst,
      'b',
      { completed: true },
      { finishesExercise: true, suggestNext: true, addedByHand: false, workoutBodyweight: 82 },
    );
    expect(afterLast.isComplete).toBe(true);
  });

  it('keeps an exercise open when its last set was added by hand', () => {
    const squat = movement([set('a', { completed: true }), set('b')]);
    const after = movementAfterSetUpdate(
      squat,
      'b',
      { completed: true },
      { finishesExercise: true, suggestNext: true, addedByHand: true, workoutBodyweight: null },
    );
    expect(after.isComplete).toBe(false);
  });

  it('confirms a rest edit without treating it as entered performance', () => {
    const squat = movement([set('a')]);
    const after = movementAfterSetUpdate(
      squat,
      'a',
      { rest_seconds: 90 },
      { finishesExercise: false, suggestNext: false, addedByHand: false, workoutBodyweight: null },
    );
    expect(after.sets[0]).toMatchObject({
      rest_seconds: 90,
      restConfirmed: true,
      fromPrevious: true,
    });
  });
});
