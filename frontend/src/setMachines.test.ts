import { describe, expect, it } from 'vitest';
import {
  cleanMachineSettings,
  hasUnassignedMachineSets,
  movementWithMachines,
  withMachinePins,
} from './setMachines';
import type { Exercise } from './types';
import type { WorkoutDraftMovement, WorkoutDraftSet } from './workoutMovements';
import { createWorkoutSet } from './workoutSets';

const set = (key: string, values: Partial<WorkoutDraftSet> = {}): WorkoutDraftSet => ({
  ...createWorkoutSet('strength', undefined, false),
  key,
  ...values,
});
const movement: WorkoutDraftMovement = {
  key: 'm',
  exercise: { id: 'press', kind: 'strength' } as Exercise,
  notes: '',
  machinePhotoIds: ['a', 'b'],
  machinePhotosInitialized: true,
  machineSettings: [{ name: 'Seat', value: '4' }],
  supersetKey: null,
  isComplete: true,
  sets: [
    set('1', { completed: true, machine_photo_id: 'a' }),
    set('2', { completed: true, machine_photo_id: 'b' }),
  ],
};

describe('machine pins', () => {
  it('needs each logged set to name a machine when several are pinned', () => {
    expect(hasUnassignedMachineSets(['a', 'b'], [set('1', { completed: true })])).toBe(true);
    expect(hasUnassignedMachineSets(['a'], [set('1', { completed: true })])).toBe(false);
    expect(withMachinePins(movement.sets, ['a']).map((item) => item.machine_photo_id)).toEqual([
      'a',
      null,
    ]);
  });

  it('a chosen change clears dropped assignments and the settings snapshot', () => {
    const next = movementWithMachines(movement, ['a', 'c'], undefined, true);
    expect(next.sets.map((item) => item.machine_photo_id)).toEqual(['a', null]);
    expect(next.isComplete).toBe(false);
    expect(next.machineSettings).toBeUndefined();
    expect(movementWithMachines(movement, ['a', 'b'], undefined, false).machineSettings).toEqual([
      { name: 'Seat', value: '4' },
    ]);
  });

  it('a restored pin leaves the sets alone and marks the machines loaded', () => {
    const fresh = { ...movement, machinePhotoIds: [], machinePhotosInitialized: false };
    const next = movementWithMachines(fresh, ['a'], [{ name: 'Seat', value: '5' }], false);
    expect(next.machinePhotosInitialized).toBe(true);
    expect(next.sets).toBe(fresh.sets);
    expect(next.machineSettings).toEqual([{ name: 'Seat', value: '5' }]);
  });
});

describe('machine settings', () => {
  it('drops blank rows and needs a name and a number for the rest', () => {
    expect(
      cleanMachineSettings([
        { name: ' Seat ', value: ' 4.5 ' },
        { name: '', value: '' },
      ]),
    ).toEqual([{ name: 'Seat', value: '4.5' }]);
    expect(() => cleanMachineSettings([{ name: 'Seat', value: '' }])).toThrow(
      'Enter a setting name and value.',
    );
    expect(() => cleanMachineSettings([{ name: 'Seat', value: 'high' }])).toThrow(
      'Enter a number for each value.',
    );
  });
});
