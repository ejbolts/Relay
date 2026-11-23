import type { MachineSetting, WorkoutSetInput } from './types';
import type { WorkoutDraftMovement } from './workoutMovements';

export function hasUnassignedMachineSets(machineIds: string[], sets: WorkoutSetInput[]): boolean {
  return (
    machineIds.length > 1 &&
    sets.some((set) => set.completed && !machineIds.includes(set.machine_photo_id ?? ''))
  );
}

/** Removing a pin clears its assignments; adding another never guesses existing sets. */
export function withMachinePins<T extends WorkoutSetInput>(sets: T[], machineIds: string[]): T[] {
  return sets.map((set) =>
    set.machine_photo_id && !machineIds.includes(set.machine_photo_id)
      ? { ...set, machine_photo_id: null }
      : set,
  );
}

/**
 * A movement after its pinned machines change. `chosen` marks machines the person picked, which
 * clears assignments to machines no longer pinned; restored or automatic pins leave sets alone.
 * New settings replace the snapshot; without them it is kept only while the pins are unchanged.
 */
export function movementWithMachines(
  movement: WorkoutDraftMovement,
  machinePhotoIds: string[],
  machineSettings: MachineSetting[] | undefined,
  chosen: boolean,
): WorkoutDraftMovement {
  return {
    ...movement,
    machinePhotoIds,
    machinePhotosInitialized: true,
    isComplete:
      movement.isComplete &&
      !hasUnassignedMachineSets(machinePhotoIds, withMachinePins(movement.sets, machinePhotoIds)),
    sets: chosen ? withMachinePins(movement.sets, machinePhotoIds) : movement.sets,
    machineSettings:
      machineSettings ??
      (movement.machinePhotoIds.join(',') === machinePhotoIds.join(',')
        ? movement.machineSettings
        : undefined),
  };
}

const numericValue = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/;

/**
 * Machine settings as typed, checked as the server checks them: blank rows are dropped, and each
 * remaining one needs a name and a number. Throws with a message for the person otherwise.
 */
export function cleanMachineSettings(rows: MachineSetting[]): MachineSetting[] {
  const settings = rows
    .map(({ name, value }) => ({ name: name.trim(), value: value.trim() }))
    .filter(({ name, value }) => name || value);
  if (settings.some(({ name, value }) => !name || !value))
    throw new Error('Enter a setting name and value.');
  if (settings.some(({ value }) => !numericValue.test(value)))
    throw new Error('Enter a number for each value.');
  return settings;
}
