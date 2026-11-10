import type { WorkoutSetInput } from './types';

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
