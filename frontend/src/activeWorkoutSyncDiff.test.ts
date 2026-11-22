import { describe, expect, it } from 'vitest';
import { syncSetText, workoutSyncDifferences } from './activeWorkoutSyncDiff';
import type { ActiveWorkoutDraft, StoredDraftSet } from './workoutDraft';

const set = (key: string, weight: number | null, reps: number | null, completed = false) =>
  ({ key, weight_kg: weight, reps, completed, notes: null }) as StoredDraftSet;
const draft = (sets: StoredDraftSet[], overrides: Partial<ActiveWorkoutDraft> = {}) =>
  ({
    version: 1,
    startedAt: 1,
    updatedAt: 1,
    name: '',
    workoutDate: '2026-11-19',
    category: 'pull',
    notes: '',
    movements: [
      {
        key: 'row',
        exerciseId: 'barbell-row',
        notes: '',
        machinePhotoIds: [],
        supersetKey: null,
        sets,
      },
    ],
    ...overrides,
  }) as ActiveWorkoutDraft;
const name = () => 'Barbell Row';

describe('workout sync differences', () => {
  it('lists only the sets that differ, in the lifter’s unit', () => {
    const local = draft([set('a', 70, 8), set('b', 87.5, 7)]);
    const remote = draft([set('a', 95, 8), set('b', 87.5, 7)]);
    expect(workoutSyncDifferences(local, remote, name, 'kg')).toEqual([
      {
        key: 'row:0',
        label: 'Barbell Row · set 1',
        local: '70 kg × 8 reps',
        remote: '95 kg × 8 reps',
      },
    ]);
    expect(workoutSyncDifferences(local, remote, name, 'lb')[0].local).toBe('154.32 lb × 8 reps');
  });

  it('shows blank sets as a dash, not "0 sec", and marks ticked sets', () => {
    expect(syncSetText(set('a', null, null), 'kg')).toBe('–');
    expect(syncSetText(set('a', 60, 10, true), 'kg')).toBe('60 kg × 10 reps ✓');
  });

  it('names exercises, notes and a workout ended on one device', () => {
    const local = draft([set('a', 70, 8)], { notes: 'Gym busy' });
    const remote = draft([], { movements: [] });
    expect(workoutSyncDifferences(local, remote, name, 'kg')).toEqual([
      { key: 'row', label: 'Barbell Row', local: 'Added · 1 set', remote: 'Not added' },
      { key: 'notes', label: 'Workout notes', local: 'Gym busy', remote: '–' },
    ]);
    expect(workoutSyncDifferences(local, null, name, 'kg')).toEqual([
      { key: 'workout', label: 'Workout', local: 'In progress', remote: 'Ended' },
    ]);
  });
});
