import { describe, expect, it } from 'vitest';
import { syncSetText } from './activeWorkoutSyncDiff';
import {
  extraRepsAction,
  extraRepsLabel,
  extraRepsNotice,
  extraRepsText,
  hasExtraReps,
  tracksExtraReps,
  withFullRepsCounted,
} from './extraReps';
import type { Exercise, TrackedWorkout } from './types';
import { isWorkoutSetAutoSavable, workoutSetAfterEdit } from './workoutAutoSave';
import { workoutEditSnapshot, type WorkoutEditFields } from './workoutEditChanges';
import { checkWorkoutFinish, finishedWorkoutInput, type WorkoutFinishState } from './workoutFinish';
import {
  savedWorkoutMovements,
  type WorkoutDraftMovement,
  type WorkoutDraftSet,
} from './workoutMovements';
import { movementAfterSetUpdate } from './workoutSetUpdate';
import {
  completeRemainingSets,
  createSuggestedWorkoutSet,
  hasRecordedPerformance,
  isCompletedWorkingSet,
} from './workoutSets';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';

const raise: Exercise = {
  id: 'raise',
  name: 'Lateral Raise',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Shoulders',
  equipment: 'Dumbbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
  extra_reps_enabled: true,
};

function set(values: Partial<WorkoutDraftSet> = {}): WorkoutDraftSet {
  return {
    key: 'set',
    reps: null,
    weight_kg: null,
    rpe: null,
    rest_seconds: null,
    duration_seconds: null,
    distance_km: null,
    notes: null,
    set_type: 'normal',
    warmup: false,
    failed: false,
    completed: false,
    ...values,
  };
}

function movement(sets: WorkoutDraftSet[]): WorkoutDraftMovement {
  return {
    key: 'raise',
    exercise: raise,
    notes: '',
    machinePhotoIds: [],
    machinePhotosInitialized: true,
    supersetKey: null,
    isComplete: false,
    sets,
  };
}

const startedAt = new Date(2026, 10, 28, 9, 0).getTime();

function finishing(values: Partial<WorkoutFinishState>): WorkoutFinishState {
  return {
    movements: [],
    name: '',
    category: 'push',
    customTypeId: null,
    workoutTypeExplicit: false,
    selectedType: DEFAULT_WORKOUT_TYPES.find((type) => type.id === 'push')!,
    typeOptions: DEFAULT_WORKOUT_TYPES,
    types: DEFAULT_WORKOUT_TYPES,
    typesLoading: false,
    editing: false,
    resumedWorkoutId: null,
    startedAt,
    previousDurationMinutes: 0,
    durationOverrideMinutes: null,
    pause: { pausedMs: 0, pausedAt: null },
    editedDurationMinutes: 0,
    startTime: '',
    endTime: '',
    clientSessionId: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
    baseRevision: undefined,
    workoutDate: '2026-11-28',
    notes: '',
    ...values,
  };
}

function savedSets(state: WorkoutFinishState, inactiveEndAt?: number) {
  const check = checkWorkoutFinish(state, inactiveEndAt, startedAt + 30 * 60_000);
  if (check.kind !== 'ready') throw new Error(`not ready: ${JSON.stringify(check)}`);
  return finishedWorkoutInput(state, check).movements[0].sets;
}

describe('tracking partial and assisted reps', () => {
  it('is offered only on strength exercises whose owner turned it on', () => {
    expect(tracksExtraReps(raise)).toBe(true);
    expect(tracksExtraReps({ ...raise, extra_reps_enabled: false })).toBe(false);
    // An exercise read before the setting existed has no value for it.
    expect(tracksExtraReps({ kind: 'strength' })).toBe(false);
    expect(tracksExtraReps({ kind: 'cardio', extra_reps_enabled: true })).toBe(false);
    expect(tracksExtraReps(undefined)).toBe(false);
  });

  it('names the switch by what choosing it does, and confirms the change', () => {
    expect(extraRepsAction(false)).toBe('Track partial & assisted reps');
    expect(extraRepsAction(true)).toBe('Stop tracking partial & assisted reps');
    expect(extraRepsNotice(true, 'Lateral Raise')).toBe(
      'Partial and assisted reps on for Lateral Raise',
    );
    expect(extraRepsNotice(false, 'Lateral Raise')).toBe(
      'Partial and assisted reps off for Lateral Raise',
    );
  });
});

describe('a set with partial and assisted reps', () => {
  it('shows them beside the full reps, leaving out a kind with none', () => {
    expect(extraRepsText({ partial_reps: 4, assisted_reps: 2 })).toBe('+4 partial · +2 assisted');
    expect(extraRepsText({ partial_reps: null, assisted_reps: 1 })).toBe('+1 assisted');
    expect(extraRepsLabel({ partial_reps: 1, assisted_reps: 2 })).toBe(
      '1 partial rep, 2 assisted reps',
    );
    for (const none of [{}, { partial_reps: null }, { partial_reps: 0, assisted_reps: 0 }]) {
      expect(hasExtraReps(none)).toBe(false);
      expect(extraRepsText(none)).toBeNull();
      expect(extraRepsLabel(none)).toBeNull();
    }
    expect(hasExtraReps({ assisted_reps: 3 })).toBe(true);
  });

  it('appears in the comparison of two devices, so a difference there is seen', () => {
    const mine = { ...set({ reps: 12, weight_kg: 10, completed: true }), partial_reps: 4 };
    expect(syncSetText(mine, 'kg')).toBe('10 kg × 12 reps +4 partial ✓');
    expect(syncSetText({ ...mine, partial_reps: null }, 'kg')).toBe('10 kg × 12 reps ✓');
  });

  it('counts as something to log, and as entered rather than a suggestion', () => {
    expect(hasRecordedPerformance('strength', set())).toBe(false);
    expect(hasRecordedPerformance('strength', set({ partial_reps: 6 }))).toBe(true);
    expect(hasRecordedPerformance('strength', set({ partial_reps: 0 }))).toBe(false);
    // Reps mean nothing on a cardio set, whatever an older draft carries.
    expect(hasRecordedPerformance('cardio', set({ assisted_reps: 2 }))).toBe(false);

    const suggested = set({ reps: 12, weight_kg: 10, fromPrevious: true });
    expect(isWorkoutSetAutoSavable('strength', suggested)).toBe(false);
    const entered = workoutSetAfterEdit(suggested, { assisted_reps: 2 });
    expect(entered.fromPrevious).toBe(false);
    expect(isWorkoutSetAutoSavable('strength', entered)).toBe(true);
    expect(isWorkoutSetAutoSavable('strength', set({ partial_reps: 5 }))).toBe(true);
  });

  it('is not suggested again next time: only the weight and full reps carry over', () => {
    const next = createSuggestedWorkoutSet('strength', {
      ...set({ reps: 12, weight_kg: 10, completed: true }),
      partial_reps: 4,
      assisted_reps: 2,
    });
    expect(next).toMatchObject({ reps: 12, weight_kg: 10, completed: false });
    expect(hasExtraReps(next)).toBe(false);
  });
});

describe('a set of partial or assisted reps alone', () => {
  it('records 0 full reps once it is logged, and still counts as a working set', () => {
    const logged = withFullRepsCounted('strength', set({ partial_reps: 15, completed: true }));
    expect(logged.reps).toBe(0);
    expect(isCompletedWorkingSet(logged)).toBe(true);
    // Until it is ticked, the empty reps field stays empty.
    expect(withFullRepsCounted('strength', set({ partial_reps: 15 })).reps).toBeNull();
    // Entered full reps, and sets without extra reps, are left alone.
    const full = set({ reps: 8, partial_reps: 2, completed: true });
    expect(withFullRepsCounted('strength', full)).toBe(full);
    const empty = set({ completed: true });
    expect(withFullRepsCounted('strength', empty)).toBe(empty);
  });

  it('is logged by its tick and by finishing the exercise', () => {
    const lifting = movement([set({ key: 'a', weight_kg: 10, partial_reps: 15 })]);
    const ticked = movementAfterSetUpdate(
      lifting,
      'a',
      { completed: true },
      { finishesExercise: true, suggestNext: true, addedByHand: false, workoutBodyweight: 80 },
    );
    expect(ticked.sets[0]).toMatchObject({ completed: true, reps: 0, partial_reps: 15 });

    const [finished, blank] = completeRemainingSets('strength', [
      set({ key: 'a', assisted_reps: 3 }),
      set({ key: 'b', weight_kg: 10 }),
    ]);
    expect(finished).toMatchObject({ completed: true, reps: 0, assisted_reps: 3 });
    expect(blank.completed).toBe(false);
  });

  it('is saved by a workout left running, as its tick would have saved it', () => {
    const state = finishing({ movements: [movement([set({ weight_kg: 10, partial_reps: 15 })])] });
    expect(savedSets(state, startedAt + 20 * 60_000)[0]).toMatchObject({
      completed: true,
      reps: 0,
      partial_reps: 15,
      assisted_reps: null,
    });
  });
});

describe('saving partial and assisted reps', () => {
  it('always sends both fields, so clearing one is saved', () => {
    const sets = [
      set({
        key: 'a',
        reps: 12,
        weight_kg: 10,
        partial_reps: 4,
        assisted_reps: 2,
        completed: true,
      }),
      set({ key: 'b', reps: 10, weight_kg: 10, completed: true }),
    ];
    const saved = savedSets(finishing({ movements: [movement(sets)] }));
    expect(saved.map((item) => [item.reps, item.partial_reps, item.assisted_reps])).toEqual([
      [12, 4, 2],
      [10, null, null],
    ]);
    expect(Object.keys(saved[1])).toEqual(
      expect.arrayContaining(['partial_reps', 'assisted_reps']),
    );
  });

  it('names the set and field when a count is out of range', () => {
    const state = (values: Partial<WorkoutDraftSet>) =>
      finishing({ movements: [movement([set({ reps: 8, completed: true, ...values })])] });
    expect(checkWorkoutFinish(state({ partial_reps: 10_001 }))).toEqual({
      kind: 'blocked',
      message:
        'Lateral Raise, set 1: partial reps (10001) must be a whole number between 0 and 10,000.',
    });
    expect(checkWorkoutFinish(state({ assisted_reps: 2.5 }))).toMatchObject({
      kind: 'blocked',
      message: expect.stringContaining('assisted reps (2.5) must be a whole number'),
    });
  });

  it('opens a saved workout with them and treats a change to them as an edit', () => {
    const workout = {
      movements: [
        {
          exercise: raise,
          notes: null,
          machine_photos: [],
          superset_group_id: null,
          sets: [
            {
              ...set({ reps: 12, weight_kg: 10, completed: true }),
              id: 's1',
              order_index: 0,
              partial_reps: 4,
            },
          ],
        },
      ],
    } as unknown as TrackedWorkout;
    let key = 0;
    const movements = savedWorkoutMovements(workout, () => `k${(key += 1)}`);
    expect(movements[0].sets[0]).toMatchObject({ partial_reps: 4, assisted_reps: null });

    const fields = (edited: WorkoutDraftMovement[]): WorkoutEditFields => ({
      name: 'Shoulders',
      workoutDate: '2026-11-28',
      category: 'push',
      customTypeId: null,
      notes: '',
      durationMinutes: 40,
      startTime: '',
      endTime: '',
      movements: edited,
    });
    const changed = [{ ...movements[0], sets: [{ ...movements[0].sets[0], assisted_reps: 2 }] }];
    expect(workoutEditSnapshot(fields(changed))).not.toBe(workoutEditSnapshot(fields(movements)));
    // A saved set without the fields reads the same as one where they are empty.
    const older = [
      {
        ...movements[0],
        sets: [{ ...movements[0].sets[0], partial_reps: undefined, assisted_reps: undefined }],
      },
    ];
    const cleared = [{ ...movements[0], sets: [{ ...movements[0].sets[0], partial_reps: null }] }];
    expect(workoutEditSnapshot(fields(older))).toBe(workoutEditSnapshot(fields(cleared)));
  });
});
