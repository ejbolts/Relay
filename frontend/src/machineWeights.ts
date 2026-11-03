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

/** How far back "recent" machine use reaches when recommending a reference. */
export const RECENT_DAYS = 90;

/** Sessions on each machine in the last three months, up to `today` (YYYY-MM-DD). */
export function recentSessionCounts(
  progress: ExerciseProgress,
  today: string,
): Map<string, number> {
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - RECENT_DAYS);
  const cutoff = since.toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  for (const point of progress.machine_points ?? []) {
    if (!point.machine_photo_id || point.workout_date < cutoff || point.workout_date > today) {
      continue;
    }
    counts.set(point.machine_photo_id, (counts.get(point.machine_photo_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * The machine to recommend as the reference: the one used most in the last three months, so
 * converted numbers read in the weights you lift now. Ties, and exercises with no recent
 * sessions, fall back to the most used machine overall.
 */
export function recommendedReferenceId(
  mapping: WeightMapping,
  recent: Map<string, number>,
): string | null {
  return (
    mapping.machines.reduce<MachineWeight | null>((best, machine) => {
      if (!best) return machine;
      const difference = (recent.get(machine.id) ?? 0) - (recent.get(best.id) ?? 0);
      return difference > 0 || (difference === 0 && machine.workout_count > best.workout_count)
        ? machine
        : best;
    }, null)?.id ?? null
  );
}

export interface FactorSuggestion {
  factor: number;
  /** Sessions on this machine compared with the reference machine's trend. */
  sessions: number;
}

/** Interpolate the reference trend between sessions up to this far apart. */
const BRIDGE_DAYS = 56;
/** Otherwise compare with the nearest reference session this close. */
const NEAREST_DAYS = 14;
const MIN_SESSIONS = 2;
const DAY_MS = 86_400_000;

function median(values: number[]): number {
  const sorted = values.slice().sort((first, second) => first - second);
  const middle = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Suggest each machine's conversion from its logged weights and reps: compare every session's
 * est. 1RM with the reference machine's trend on that date, interpolated between the reference
 * sessions either side, or the nearest one within two weeks. The median ratio puts the machine's
 * sessions on the reference trend without letting one odd session pull it away. Sessions
 * without a single machine count as the reference.
 */
export function suggestFactors(
  progress: ExerciseProgress,
  referenceId: string | null,
): Map<string, FactorSuggestion> {
  const suggestions = new Map<string, FactorSuggestion>();
  if (!referenceId) return suggestions;
  const sessions = (progress.machine_points ?? [])
    .filter((point) => point.estimated_1rm > 0)
    .map((point) => ({
      machine: point.machine_photo_id ?? referenceId,
      time: Date.parse(`${point.workout_date}T00:00:00Z`),
      value: point.estimated_1rm,
    }))
    .sort((first, second) => first.time - second.time);
  const references = sessions.filter((session) => session.machine === referenceId);
  const ratios = new Map<string, number[]>();
  for (const session of sessions) {
    if (session.machine === referenceId) continue;
    const next = references.findIndex((item) => item.time >= session.time);
    const after = next === -1 ? undefined : references[next];
    const before =
      after?.time === session.time
        ? after
        : references[(next === -1 ? references.length : next) - 1];
    let expected: number | null = null;
    if (before && after && after.time - before.time <= BRIDGE_DAYS * DAY_MS) {
      const span = after.time - before.time;
      expected = span
        ? before.value + ((after.value - before.value) * (session.time - before.time)) / span
        : (before.value + after.value) / 2;
    } else {
      const nearest = [before, after]
        .filter((item) => item && Math.abs(item.time - session.time) <= NEAREST_DAYS * DAY_MS)
        .sort((a, b) => Math.abs(a!.time - session.time) - Math.abs(b!.time - session.time))[0];
      expected = nearest?.value ?? null;
    }
    if (expected) {
      ratios.set(session.machine, [
        ...(ratios.get(session.machine) ?? []),
        expected / session.value,
      ]);
    }
  }
  for (const [machine, values] of ratios) {
    if (values.length < MIN_SESSIONS) continue;
    suggestions.set(machine, {
      factor: Math.round(median(values) * 100) / 100,
      sessions: values.length,
    });
  }
  return suggestions;
}

/** The slider's range of conversions, from half to double the reference's weights. */
export const FACTOR_RANGE = { min: 0.5, max: 2, step: 0.01 } as const;

export function clampFactor(factor: number): number {
  return Math.min(FACTOR_RANGE.max, Math.max(FACTOR_RANGE.min, Math.round(factor * 100) / 100));
}
