import { describe, expect, it } from 'vitest';
import {
  lastUsedMachineId,
  machinesByExercise,
  resolveMachineChoices,
  toggledMachineChoice,
} from './exerciseMachineChoices';
import { machineSelection } from './workoutMovements';
import type { MachinePhotoUsage } from './types';

function machine(id: string, exerciseId: string, lastUsed: string | null): MachinePhotoUsage {
  return {
    id,
    exercise_id: exerciseId,
    exercise_name: exerciseId,
    caption: id,
    thumbnail_url: `/thumb/${id}`,
    full_url: `/full/${id}`,
    width: 64,
    height: 48,
    created_at: '2026-01-01T00:00:00Z',
    workout_count: lastUsed ? 1 : 0,
    last_used_date: lastUsed,
  };
}

const hammer = machine('hammer', 'chest', '2026-10-01');
const matrix = machine('matrix', 'chest', '2026-11-01');
const unused = machine('unused', 'chest', null);
const legNew = machine('leg-new', 'leg', null);
const grouped = machinesByExercise([matrix, hammer, unused, legNew]);

describe('exercise machine choices', () => {
  it('groups machines by exercise in their original order', () => {
    expect(grouped.get('chest')?.map((item) => item.id)).toEqual(['matrix', 'hammer', 'unused']);
    expect(grouped.get('leg')?.map((item) => item.id)).toEqual(['leg-new']);
  });

  it('finds the most recently used machine and keeps the first on a tie', () => {
    expect(lastUsedMachineId([hammer, matrix, unused])).toBe('matrix');
    expect(lastUsedMachineId([hammer, machine('twin', 'chest', '2026-10-01')])).toBe('hammer');
    expect(lastUsedMachineId([unused, legNew])).toBeNull();
  });

  it('returns to the baseline exercise when the chosen machine is tapped again', () => {
    expect(toggledMachineChoice('hammer', 'hammer')).toBeNull();
    expect(toggledMachineChoice('hammer', 'matrix')).toBe('matrix');
    expect(toggledMachineChoice(null, 'hammer')).toBe('hammer');
  });

  it('preselects the last-used machine, honours explicit choices and skips exercises without machines', () => {
    expect(resolveMachineChoices(['chest', 'leg', 'squat'], grouped, {})).toEqual({
      chest: 'matrix',
      leg: null,
    });
    expect(resolveMachineChoices(['chest'], grouped, { chest: 'hammer' })).toEqual({
      chest: 'hammer',
    });
    expect(resolveMachineChoices(['chest'], grouped, { chest: null })).toEqual({ chest: null });
    // A choice for a machine that no longer exists falls back to the last-used machine.
    expect(resolveMachineChoices(['chest'], grouped, { chest: 'deleted' })).toEqual({
      chest: 'matrix',
    });
  });

  it('turns picker choices into movement machine fields', () => {
    expect(machineSelection('chest', { chest: 'hammer' })).toEqual({
      machinePhotoIds: ['hammer'],
      machinePhotosInitialized: true,
      machineSettings: undefined,
    });
    expect(machineSelection('chest', { chest: null })).toEqual({
      machinePhotoIds: [],
      machinePhotosInitialized: true,
      machineSettings: undefined,
    });
    // Without a picker choice, the logger still restores the last-used machine itself.
    expect(machineSelection('squat', { chest: 'hammer' })).toEqual({
      machinePhotoIds: [],
      machinePhotosInitialized: false,
      machineSettings: undefined,
    });
  });
});
