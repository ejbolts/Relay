import { describe, expect, it } from 'vitest';
import {
  applySupersetSelection,
  clearSuperset,
  keepSupersetTogether,
  nextInSupersetRound,
  supersetGroupName,
  supersetRoundPending,
} from './workoutSupersets';

type Movement = {
  key: string;
  name: string;
  supersetKey: string | null;
};

const movements: Movement[] = [
  { key: 'bench', name: 'Bench press', supersetKey: null },
  { key: 'row', name: 'Cable row', supersetKey: null },
  { key: 'curl', name: 'Biceps curl', supersetKey: null },
  { key: 'squat', name: 'Squat', supersetKey: 'other-group' },
];

describe('superset selection', () => {
  it('groups the anchor with every selected exercise', () => {
    const grouped = applySupersetSelection(movements, 'bench', ['row', 'curl'], 'new-group');

    expect(grouped.map((movement) => movement.supersetKey)).toEqual([
      'new-group',
      'new-group',
      'new-group',
      'other-group',
    ]);
  });

  it('updates an existing group and unlinks deselected members', () => {
    const grouped = applySupersetSelection(movements, 'bench', ['row'], 'group');
    const updated = applySupersetSelection(grouped, 'bench', ['curl'], 'unused-group');

    expect(updated.find((movement) => movement.key === 'bench')?.supersetKey).toBe('group');
    expect(updated.find((movement) => movement.key === 'row')?.supersetKey).toBeNull();
    expect(updated.find((movement) => movement.key === 'curl')?.supersetKey).toBe('group');
  });

  it('removes the whole group from any member', () => {
    const grouped = applySupersetSelection(movements, 'bench', ['row'], 'group');
    const cleared = clearSuperset(grouped, 'row');

    expect(cleared.find((movement) => movement.key === 'bench')?.supersetKey).toBeNull();
    expect(cleared.find((movement) => movement.key === 'row')?.supersetKey).toBeNull();
  });
});

describe('tri-sets', () => {
  const sets = (logged: number, total = 3) =>
    Array.from({ length: total }, (_, index) => ({ completed: index < logged }));
  const triSet = (bench: number, row: number, curl: number) => [
    { key: 'bench', supersetKey: 'tri', sets: sets(bench) },
    { key: 'squat', supersetKey: null, sets: sets(0) },
    { key: 'row', supersetKey: 'tri', sets: sets(row) },
    { key: 'curl', supersetKey: 'tri', sets: sets(curl) },
  ];

  it('names groups by size', () => {
    expect([2, 3, 4, 6].map(supersetGroupName)).toEqual([
      'Superset',
      'Tri-set',
      'Giant set',
      'Giant set',
    ]);
  });

  it('moves grouped exercises together after the first one', () => {
    const listed = [
      { key: 'bench', supersetKey: 'tri' },
      { key: 'squat', supersetKey: null },
      { key: 'press', supersetKey: null },
      { key: 'row', supersetKey: 'tri' },
      { key: 'curl', supersetKey: 'tri' },
    ];

    expect(keepSupersetTogether(listed, 'tri').map((movement) => movement.key)).toEqual([
      'bench',
      'row',
      'curl',
      'squat',
      'press',
    ]);
    expect(keepSupersetTogether(listed, 'missing')).toBe(listed);
    const together = keepSupersetTogether(listed, 'tri');
    expect(keepSupersetTogether(together, 'tri')).toBe(together);
  });

  it('moves through each exercise in a round before resting', () => {
    expect(nextInSupersetRound(triSet(1, 0, 0), 'bench')?.key).toBe('row');
    expect(nextInSupersetRound(triSet(1, 1, 0), 'row')?.key).toBe('curl');
    expect(nextInSupersetRound(triSet(1, 1, 1), 'curl')).toBeNull();
    expect(nextInSupersetRound(triSet(2, 1, 1), 'bench')?.key).toBe('row');
  });

  it('returns to an earlier exercise that was skipped this round', () => {
    expect(nextInSupersetRound(triSet(0, 1, 1), 'curl')?.key).toBe('bench');
    expect(nextInSupersetRound(triSet(0, 1, 0), 'row')?.key).toBe('bench');
    expect(supersetRoundPending(triSet(0, 1, 1), 'tri').map((item) => item.key)).toEqual(['bench']);
  });

  it('does not wait for an exercise with no set left in that round', () => {
    const uneven = triSet(3, 2, 2).map((movement) =>
      movement.key === 'bench' ? movement : { ...movement, sets: sets(2, 2) },
    );

    expect(nextInSupersetRound(uneven, 'bench')).toBeNull();
    expect(nextInSupersetRound(triSet(1, 0, 0), 'squat')).toBeNull();
  });
});
