import { describe, expect, it } from 'vitest';
import {
  muscleMatchPercent,
  rankSwapAlternatives,
  swapMovementExercise,
  swapMuscleCreditList,
} from './exerciseSwap';
import type { Exercise } from './types';
import type { WorkoutDraftMovement, WorkoutDraftSet } from './workoutMovements';
import { createWorkoutSet } from './workoutSets';

function exercise(
  id: string,
  credits: Record<string, number>,
  overrides: Partial<Exercise> = {},
): Exercise {
  return {
    id,
    name: id,
    category: 'push',
    kind: 'strength',
    muscle_group: Object.keys(credits)[0] ?? 'Chest',
    equipment: 'Machine',
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
    default_muscle_set_credits: Object.entries(credits).map(([muscle_name, sets]) => ({
      muscle_name,
      sets,
    })),
    ...overrides,
  };
}

const chestPress = exercise('Chest press machine', { Chest: 1, 'Front delts': 0.5, Triceps: 0.5 });
const dumbbellBench = exercise(
  'Dumbbell bench press',
  { Chest: 1, 'Front delts': 0.5, Triceps: 0.5 },
  { equipment: 'dumbbells' },
);
const pecDeck = exercise('Pec deck', { Chest: 1 });
const lateralRaise = exercise('Lateral raise', { 'Side delts': 1 });
const treadmill = exercise('Treadmill', {}, { kind: 'cardio', category: 'cardio' });
const bike = exercise('Bike', {}, { kind: 'cardio', category: 'cardio' });

function set(overrides: Partial<WorkoutDraftSet>): WorkoutDraftSet {
  return {
    ...createWorkoutSet('strength', undefined, false),
    key: crypto.randomUUID(),
    ...overrides,
  };
}

function movement(sets: WorkoutDraftSet[], overrides: Partial<WorkoutDraftMovement> = {}) {
  return {
    key: 'press',
    exercise: chestPress,
    notes: 'Seat 4',
    machinePhotoIds: ['photo'],
    machinePhotosInitialized: true,
    machineSettings: [{ name: 'Seat', value: '4' }],
    supersetKey: null,
    isComplete: false,
    sets,
    ...overrides,
  } satisfies WorkoutDraftMovement;
}

describe('muscle matching', () => {
  it('scores the share of the original muscle credit the alternative also earns', () => {
    expect(muscleMatchPercent(chestPress, dumbbellBench)).toBe(100);
    expect(muscleMatchPercent(chestPress, pecDeck)).toBe(50);
    expect(muscleMatchPercent(chestPress, lateralRaise)).toBe(0);
  });

  it('falls back to the muscle group and ignores case and blank credits', () => {
    const legacy = exercise('Legacy press', {}, { default_muscle_set_credits: undefined });
    expect(swapMuscleCreditList({ ...legacy, muscle_group: ' Chest ' })).toEqual([
      { muscle: 'Chest', sets: 1 },
    ]);
    const shouty = exercise('Shouty fly', { CHEST: 1, '': 1 });
    expect(muscleMatchPercent(pecDeck, shouty)).toBe(100);
  });

  it('ranks same-kind alternatives by match, then recent use, dropping poor matches', () => {
    const smith = exercise('Smith bench', { Chest: 1, 'Front delts': 0.5, Triceps: 0.5 });
    const ranked = rankSwapAlternatives(
      chestPress,
      [chestPress, pecDeck, smith, dumbbellBench, lateralRaise, treadmill],
      { recentExerciseIds: [dumbbellBench.id] },
    );
    expect(ranked.map((item) => [item.exercise.id, item.match, item.equipment])).toEqual([
      ['Dumbbell bench press', 100, 'Dumbbell'],
      ['Smith bench', 100, 'Machine'],
      ['Pec deck', 50, 'Machine'],
    ]);
    expect(
      rankSwapAlternatives(chestPress, [dumbbellBench, pecDeck], { excludedIds: [pecDeck.id] }),
    ).toHaveLength(1);
  });

  it('leaves hidden exercises out of the alternatives', () => {
    expect(
      rankSwapAlternatives(chestPress, [dumbbellBench, { ...pecDeck, hidden: true }]).map(
        (item) => item.exercise.id,
      ),
    ).toEqual([dumbbellBench.id]);
  });

  it('offers other cardio exercises without a match percentage', () => {
    expect(rankSwapAlternatives(treadmill, [bike, chestPress])).toEqual([
      { exercise: bike, match: null, equipment: 'Machine' },
    ]);
  });
});

describe('swapping a movement', () => {
  const lastSession = [
    set({ set_type: 'warmup', warmup: true, weight_kg: 10, reps: 12, fromPrevious: true }),
    set({ weight_kg: 24, reps: 10, fromPrevious: true }),
    set({ weight_kg: 26, reps: 8, fromPrevious: true }),
  ];

  it('keeps logged sets on the original and moves planned sets with the new loads', () => {
    const logged = set({ weight_kg: 60, reps: 10, rpe: 8, completed: true });
    const plannedWarmup = set({ set_type: 'warmup', warmup: true, weight_kg: 30, reps: 12 });
    const planned = [
      set({ weight_kg: 60, reps: 10, rest_seconds: 120, notes: 'Pause' }),
      set({ weight_kg: 60, reps: 8, set_type: 'drop' }),
      set({ weight_kg: 60, reps: 6 }),
    ];
    const [original, replacement] = swapMovementExercise(
      [movement([logged, plannedWarmup, ...planned])],
      'press',
      dumbbellBench,
      lastSession,
    );

    expect(original).toMatchObject({ key: 'press', exercise: chestPress, isComplete: true });
    expect(original.sets).toEqual([logged]);
    expect(original.machinePhotoIds).toEqual(['photo']);

    expect(replacement.key).not.toBe('press');
    expect(replacement).toMatchObject({
      exercise: dumbbellBench,
      notes: '',
      machinePhotoIds: [],
      machinePhotosInitialized: false,
      machineSettings: undefined,
      isComplete: false,
      swappedFrom: chestPress.name,
    });
    expect(
      replacement.sets.map((item) => [item.set_type, item.weight_kg, item.reps, item.completed]),
    ).toEqual([
      ['warmup', 10, 12, false],
      ['normal', 24, 10, false],
      ['drop', 26, 8, false],
      ['normal', 26, 6, false],
    ]);
    expect(replacement.sets[1]).toMatchObject({ rest_seconds: 120, notes: 'Pause' });
    expect(new Set(replacement.sets.map((item) => item.key)).size).toBe(4);
  });

  it('replaces the movement in place when nothing is logged yet', () => {
    const next = swapMovementExercise(
      [movement([set({ weight_kg: 60, reps: 10 })]), movement([], { key: 'other' })],
      'press',
      pecDeck,
      [set({})],
      { machinePhotoIds: ['deck'], machinePhotosInitialized: true, machineSettings: undefined },
    );
    expect(next.map((item) => item.key)).toEqual(['press', 'other']);
    expect(next[0]).toMatchObject({
      exercise: pecDeck,
      notes: 'Seat 4',
      machinePhotoIds: ['deck'],
      machinePhotosInitialized: true,
    });
    // No history for the replacement: the load is left for the lifter to enter.
    expect(next[0].sets.map((item) => [item.weight_kg, item.reps])).toEqual([[null, 10]]);
  });

  it('uses the replacement plan when every set is logged or the kind changes', () => {
    const allLogged = swapMovementExercise(
      [movement([set({ completed: true })])],
      'press',
      dumbbellBench,
      lastSession,
    );
    expect(allLogged).toHaveLength(2);
    expect(allLogged[1].sets).toBe(lastSession);

    const toCardio = swapMovementExercise(
      [movement([set({ weight_kg: 60 })])],
      'press',
      treadmill,
      lastSession,
    );
    expect(toCardio[0].sets).toBe(lastSession);
  });

  it('remembers the first exercise across swaps and forgets it when swapped back', () => {
    const once = swapMovementExercise([movement([set({})])], 'press', pecDeck, [set({})]);
    const twice = swapMovementExercise(once, 'press', dumbbellBench, [set({})]);
    expect(twice[0].swappedFrom).toBe(chestPress.name);
    const back = swapMovementExercise(twice, 'press', chestPress, [set({})]);
    expect(back[0].swappedFrom).toBeUndefined();
  });

  it('leaves the workout unchanged for an unknown movement', () => {
    const movements = [movement([set({})])];
    expect(swapMovementExercise(movements, 'missing', pecDeck, [])).toBe(movements);
  });
});
