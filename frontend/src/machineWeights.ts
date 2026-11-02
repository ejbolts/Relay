import type {
  ExerciseProgress,
  MachineProgressPoint,
  MachineWeight,
  ProgressPoint,
  WeightMapping,
} from './types';

/** Every machine together, or one saved machine's id. */
export type MachineView = 'all' | string;

/** A chart point, with the heaviest set as it was actually logged. */
export interface ProgressViewPoint extends ProgressPoint {
  raw_best_weight_kg: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Multiplier from a machine's weights to the reference machine's. */
export function machineFactor(mapping: WeightMapping | null, machineId: string | null): number {
  if (!mapping?.enabled || !machineId || machineId === mapping.reference_machine_id) return 1;
  const machine = mapping.machines.find((item) => item.id === machineId);
  return machine ? pairFactor(machine) : 1;
}

export function pairFactor(machine: Pick<MachineWeight, 'machine_kg' | 'reference_kg'>): number {
  return machine.machine_kg && machine.reference_kg ? machine.reference_kg / machine.machine_kg : 1;
}

/** Whether the "All machines" view converts weights to the reference machine. */
export function isNormalised(mapping: WeightMapping | null, view: MachineView): boolean {
  return view === 'all' && Boolean(mapping?.enabled && mapping.reference_machine_id);
}

const raw = (point: ProgressPoint): ProgressViewPoint => ({
  ...point,
  raw_best_weight_kg: point.best_weight_kg,
});

/**
 * Points for the chosen view. "All machines" converts each machine's sets when
 * normalising is on; one machine shows its own sessions as logged. Sets without a
 * single pinned machine count as the reference machine.
 */
export function progressViewPoints(
  progress: ExerciseProgress,
  mapping: WeightMapping | null,
  view: MachineView,
): ProgressViewPoint[] {
  const machinePoints = progress.machine_points ?? [];
  if (view !== 'all') {
    const includeUnpinned = Boolean(mapping?.enabled) && view === mapping?.reference_machine_id;
    return machinePoints
      .filter(
        (point) =>
          point.machine_photo_id === view || (includeUnpinned && point.machine_photo_id === null),
      )
      .map(raw);
  }
  if (!isNormalised(mapping, view) || !machinePoints.length) return progress.points.map(raw);

  const byWorkout = new Map<string, MachineProgressPoint[]>();
  for (const point of machinePoints) {
    byWorkout.set(point.workout_id, [...(byWorkout.get(point.workout_id) ?? []), point]);
  }
  return progress.points.map((point) => {
    const groups = byWorkout.get(point.workout_id);
    if (!groups) return raw(point);
    const scaled = groups.map((group) => ({
      group,
      factor: machineFactor(mapping, group.machine_photo_id),
    }));
    const heaviest = scaled.reduce((best, item) =>
      item.group.best_weight_kg * item.factor > best.group.best_weight_kg * best.factor
        ? item
        : best,
    );
    return {
      ...point,
      best_weight_kg: round1(heaviest.group.best_weight_kg * heaviest.factor),
      best_reps: heaviest.group.best_reps,
      best_rpe: heaviest.group.best_rpe,
      raw_best_weight_kg: heaviest.group.best_weight_kg,
      estimated_1rm: round1(
        Math.max(...scaled.map(({ group, factor }) => group.estimated_1rm * factor)),
      ),
      volume_kg: round1(
        scaled.reduce((sum, { group, factor }) => sum + group.volume_kg * factor, 0),
      ),
    };
  });
}

/** Saved machines that have sessions in this exercise's progress, most used first. */
export function machinesWithSessions(
  progress: ExerciseProgress,
  mapping: WeightMapping | null,
): MachineWeight[] {
  if (!mapping) return [];
  const used = new Set((progress.machine_points ?? []).map((point) => point.machine_photo_id));
  if (mapping.enabled && used.has(null) && mapping.reference_machine_id) {
    used.add(mapping.reference_machine_id);
  }
  return mapping.machines
    .filter((machine) => used.has(machine.id))
    .sort((first, second) => second.workout_count - first.workout_count);
}

/** Workouts whose heaviest set beat every earlier one in the view. */
export function runningBestIds(points: ProgressPoint[]): Set<string> {
  const ids = new Set<string>();
  let best = 0;
  for (const point of points) {
    if (point.best_weight_kg > best) {
      best = point.best_weight_kg;
      ids.add(point.workout_id);
    }
  }
  return ids;
}

/**
 * Make another machine the reference, re-expressing every pair against it so each
 * machine's conversion stays the same.
 */
export function withReference(mapping: WeightMapping, referenceId: string): WeightMapping {
  const previousId = mapping.reference_machine_id;
  if (previousId === referenceId) return mapping;
  const next = mapping.machines.find((machine) => machine.id === referenceId);
  const nextFactor = next ? pairFactor(next) : 1;
  return {
    ...mapping,
    reference_machine_id: referenceId,
    machines: mapping.machines.map((machine) => {
      if (machine.id === referenceId) return { ...machine, machine_kg: null, reference_kg: null };
      if (machine.id === previousId) {
        return next?.machine_kg && next.reference_kg
          ? { ...machine, machine_kg: next.reference_kg, reference_kg: next.machine_kg }
          : { ...machine, machine_kg: null, reference_kg: null };
      }
      if (!machine.machine_kg || !machine.reference_kg) return machine;
      return { ...machine, reference_kg: round1(machine.reference_kg / nextFactor) };
    }),
  };
}

/** The most used machine, as the default reference when normalising is first turned on. */
export function defaultReferenceId(mapping: WeightMapping): string | null {
  return (
    mapping.machines.reduce<MachineWeight | null>(
      (best, machine) => (!best || machine.workout_count > best.workout_count ? machine : best),
      null,
    )?.id ?? null
  );
}
