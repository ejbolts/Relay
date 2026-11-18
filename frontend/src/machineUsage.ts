import type { TrackedWorkout } from './types';

/**
 * The exercise most worth comparing machines on: the one logged on two or more different
 * machines, most sessions first. Null while every exercise has stayed on one machine.
 */
export function multiMachineExerciseId(workouts: TrackedWorkout[]): string | null {
  const usage = new Map<string, { machines: Set<string>; sessions: number }>();
  for (const workout of workouts) {
    if (workout.is_sample) continue;
    for (const movement of workout.movements ?? []) {
      const machines = [
        ...(movement.machine_photos ?? []).map((photo) => photo.id),
        ...movement.sets.flatMap((item) => (item.machine_photo_id ? [item.machine_photo_id] : [])),
      ];
      if (!machines.length) continue;
      const entry = usage.get(movement.exercise.id) ?? { machines: new Set(), sessions: 0 };
      for (const id of machines) entry.machines.add(id);
      entry.sessions += 1;
      usage.set(movement.exercise.id, entry);
    }
  }
  let best: { id: string; sessions: number } | null = null;
  for (const [id, entry] of usage)
    if (entry.machines.size > 1 && (!best || entry.sessions > best.sessions))
      best = { id, sessions: entry.sessions };
  return best?.id ?? null;
}

const filler = /\b(old|new|photo|picture|pic|copy|duplicate|machine|the)\b/g;

/** A machine name reduced to what identifies it, so "Chest press (old photo)" matches itself. */
function identity(caption: string): string {
  return caption
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(filler, ' ')
    .replace(/\s+/g, '');
}

/** Whether two saved machines look like the same machine saved twice. */
export function similarMachineNames(first: string, second: string): boolean {
  const left = identity(first);
  const right = identity(second);
  if (left.length < 4 || right.length < 4) return false;
  return left === right || left.includes(right) || right.includes(left);
}

/** Whether any two of these saved machines look like duplicates. */
export function hasLikelyDuplicateMachines(captions: string[]): boolean {
  return captions.some((caption, index) =>
    captions.slice(index + 1).some((other) => similarMachineNames(caption, other)),
  );
}
