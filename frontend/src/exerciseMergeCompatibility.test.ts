import { expect, it } from 'vitest';
import { canMergeExercises, mergeChanges, mergeDistance } from './exerciseMergeCompatibility';
import type { Exercise } from './types';

const source: Exercise = {
  id: 'source',
  name: 'My bench',
  kind: 'strength',
  category: 'push',
  is_custom: true,
  is_favorite: false,
  muscle_group: 'Chest',
  equipment: 'Barbell',
  muscle_contributions: [
    { muscle_name: 'Pectorals', role: 'primary', contribution_factor: 1 },
    { muscle_name: 'Triceps', role: 'secondary', contribution_factor: 0.5 },
    { muscle_name: 'Front delts', role: 'secondary', contribution_factor: 0.5 },
  ],
};
const target = { ...source, id: 'target', is_custom: false };
it('requires the full configured muscle set and ignores order, weights and partial-set toggles', () => {
  expect(canMergeExercises({ ...source, partial_sets_enabled: false }, target)).toBe(true);
  expect(
    canMergeExercises(source, {
      ...target,
      muscle_contributions: [...source.muscle_contributions].reverse(),
    }),
  ).toBe(true);
  expect(
    canMergeExercises(source, {
      ...target,
      muscle_contributions: source.muscle_contributions.slice(0, 1),
    }),
  ).toBe(false);
  expect(
    canMergeExercises(source, {
      ...target,
      muscle_contributions: [
        ...source.muscle_contributions,
        { muscle_name: 'Lats', role: 'secondary', contribution_factor: 0.5 },
      ],
    }),
  ).toBe(false);
  const aliased = {
    ...source,
    equipment: ' BB ',
    muscle_contributions: [],
    default_muscle_set_credits: [
      { muscle_name: 'TRICEPS', sets: 1 },
      { muscle_name: 'Upper pectorals', sets: 0.5 },
      { muscle_name: 'Anterior deltoids', sets: 1 },
    ],
  };
  expect(canMergeExercises(aliased, target)).toBe(true);
});
it.each([
  [null, null, true],
  ['Smith-machine', 'smith', true],
  ['DB', 'Dumbbells', true],
  ['Machine A', ' machine a ', true],
  ['Machine A', 'Machine B', false],
  [null, 'Barbell', false],
] as const)('compares equipment %s and %s as %s', (a, b, allowed) => {
  expect(canMergeExercises({ ...source, equipment: a }, { ...target, equipment: b })).toBe(allowed);
});
it('compares the muscle field when contributions are unavailable and rejects different kinds/self/official sources', () => {
  const bare = { ...source, muscle_contributions: [], muscle_group: ' Chest ' };
  expect(
    canMergeExercises(bare, { ...target, muscle_contributions: [], muscle_group: 'chest' }),
  ).toBe(true);
  expect(
    canMergeExercises(bare, { ...target, muscle_contributions: [], muscle_group: 'Quads' }),
  ).toBe(false);
  expect(canMergeExercises(source, source)).toBe(false);
  expect(canMergeExercises({ ...source, is_custom: false }, target)).toBe(false);
  expect(canMergeExercises(source, { ...target, kind: 'cardio' })).toBe(false);
});

it('lists the equipment and muscles a custom exercise must change to merge', () => {
  const mine = {
    ...source,
    muscle_contributions: [],
    muscle_group: 'Chest',
    equipment: 'Cable',
  };
  const theirs = {
    ...target,
    equipment: 'Dumbbell',
    muscle_contributions: [],
    default_muscle_set_credits: [
      { muscle_name: 'Pectorals', sets: 1 },
      { muscle_name: 'Front delts', sets: 0.5 },
    ],
  };
  expect(mergeChanges(mine, theirs)).toEqual({
    equipment: { from: 'Cable', to: 'Dumbbell' },
    muscles: { from: ['Chest'], to: ['Pectorals', 'Front delts ½'] },
    update: {
      equipment: 'Dumbbell',
      muscle_set_credits: [
        { muscle_name: 'Pectorals', sets: 1 },
        { muscle_name: 'Front delts', sets: 0.5 },
      ],
    },
  });
  // Only the detail that differs is listed and sent.
  expect(mergeChanges({ ...mine, equipment: 'DB' }, theirs)).toMatchObject({
    equipment: null,
    update: { muscle_set_credits: expect.any(Array) },
  });
  expect(mergeChanges({ ...mine, equipment: 'DB' }, theirs)?.update).not.toHaveProperty(
    'equipment',
  );
  expect(mergeChanges(source, target)).toEqual({ equipment: null, muscles: null, update: {} });
});

it('never offers changes across kinds, for official sources, or for cardio muscles', () => {
  expect(mergeChanges(source, { ...target, kind: 'cardio' })).toBeNull();
  expect(mergeChanges({ ...source, is_custom: false }, target)).toBeNull();
  expect(mergeChanges(source, source)).toBeNull();
  const run = { ...source, kind: 'cardio' as const, category: 'cardio' as const };
  expect(
    mergeChanges(
      { ...run, muscle_group: 'Legs', muscle_contributions: [] },
      { ...run, id: 'target', is_custom: false, muscle_group: 'Cardio', muscle_contributions: [] },
    ),
  ).toBeNull();
  expect(
    mergeChanges(
      { ...run, muscle_group: 'Cardio', muscle_contributions: [], equipment: 'Track' },
      { ...run, id: 'target', muscle_group: 'Cardio', muscle_contributions: [], equipment: 'Bike' },
    ),
  ).toEqual({
    equipment: { from: 'Track', to: 'Bike' },
    muscles: null,
    update: { equipment: 'Bike' },
  });
});

it('ranks closer exercises first', () => {
  expect(mergeDistance(source, target)).toBe(0);
  expect(mergeDistance(source, { ...target, equipment: 'Dumbbell' })).toBe(1);
  expect(
    mergeDistance(source, {
      ...target,
      equipment: 'Dumbbell',
      muscle_contributions: source.muscle_contributions.slice(0, 1),
    }),
  ).toBe(3);
});
