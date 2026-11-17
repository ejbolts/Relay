import type { MachinePhotoUsage } from './types';

/**
 * The machine chosen for each picked exercise that has saved machines: a machine ID, or `null`
 * for the baseline exercise without a machine. Exercises without saved machines are absent.
 */
export type ExerciseMachineChoices = Readonly<Record<string, string | null>>;

/** Groups saved machines by exercise, keeping the API's most-recently-used-first order. */
export function machinesByExercise(
  machines: readonly MachinePhotoUsage[],
): Map<string, MachinePhotoUsage[]> {
  const grouped = new Map<string, MachinePhotoUsage[]>();
  machines.forEach((machine) => {
    const list = grouped.get(machine.exercise_id);
    if (list) list.push(machine);
    else grouped.set(machine.exercise_id, [machine]);
  });
  return grouped;
}

/** The machine from the most recent workout, or `null` when none has been used yet. */
export function lastUsedMachineId(machines: readonly MachinePhotoUsage[]): string | null {
  let latest: MachinePhotoUsage | null = null;
  machines.forEach((machine) => {
    if (!machine.last_used_date) return;
    // Strict comparison keeps the API's first machine on a tie.
    if (!latest || machine.last_used_date > latest.last_used_date!) latest = machine;
  });
  return (latest as MachinePhotoUsage | null)?.id ?? null;
}

/** Tapping the chosen machine again returns to the baseline exercise. */
export function toggledMachineChoice(current: string | null, machineId: string): string | null {
  return current === machineId ? null : machineId;
}

/**
 * Resolves each picked exercise's machine: an explicit choice wins; otherwise the last-used
 * machine is preselected. Exercises without saved machines are left for the logger to handle.
 */
export function resolveMachineChoices(
  exerciseIds: readonly string[],
  machines: ReadonlyMap<string, readonly MachinePhotoUsage[]>,
  explicit: ExerciseMachineChoices,
): ExerciseMachineChoices {
  const resolved: Record<string, string | null> = {};
  exerciseIds.forEach((id) => {
    const saved = machines.get(id);
    if (!saved?.length) return;
    const choice = explicit[id];
    resolved[id] =
      choice !== undefined && (choice === null || saved.some((machine) => machine.id === choice))
        ? choice
        : lastUsedMachineId(saved);
  });
  return resolved;
}
