import { setKindOf, type SetKindFields } from './setFieldValues';
import type { ExerciseKind } from './types';
import { formatWeight, type WeightUnit } from './weightUnits';

type CheckedSet = SetKindFields & { completed: boolean; weight_kg: number | null };

const isWarmup = (item: SetKindFields) => setKindOf(item) === 'warmup';

/** At least one set was logged and every logged set is a warm-up. */
export function loggedOnlyWarmups(sets: CheckedSet[]): boolean {
  const logged = sets.filter((item) => item.completed);
  return logged.length > 0 && logged.every(isWarmup);
}

/** Strength exercises whose logged sets are all warm-ups, named in a reminder before finishing. */
export function warmupOnlyMovements<
  T extends { exercise: { kind: ExerciseKind }; sets: CheckedSet[] },
>(movements: T[]): T[] {
  return movements.filter(
    (movement) => movement.exercise.kind !== 'cardio' && loggedOnlyWarmups(movement.sets),
  );
}

/** A logged warm-up in that reminder: "60 kg × 10", "10 reps", "60 kg", or "Set 2". */
export function warmupSetLabel(
  item: { weight_kg: number | null; reps: number | null },
  unit: WeightUnit,
  position: number,
): string {
  const weight = item.weight_kg !== null ? formatWeight(item.weight_kg, unit) : null;
  if (weight && item.reps !== null) return `${weight} × ${item.reps}`;
  if (item.reps !== null) return `${item.reps} reps`;
  return weight ?? `Set ${position}`;
}
