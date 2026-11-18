import { SET_KINDS, setKindOf, setNumberLabels, type SetKindFields } from './setFieldValues';
import { setLabel } from './trainingSummary';
import type { WeightUnit } from './weightUnits';

type RestSet = SetKindFields & {
  key: string;
  completed: boolean;
  weight_kg: number | null;
  reps: number | null;
};

interface RestMovement {
  key: string;
  exercise: { name: string; kind: string };
  sets: RestSet[];
}

/** The set the "rest complete" pill points to. */
export interface RestNextSet {
  movementKey: string;
  setKey: string;
  exercise: string;
  /** "Set 3", or the kind for a set without a number, such as "Warm-up". */
  set: string;
  /** "80 kg × 8" when the set already has a weight or reps. */
  target: string | null;
}

/**
 * The first open set at or after the exercise whose set started the rest, wrapping round to
 * earlier exercises; null once every set is logged.
 */
export function nextSetAfterRest(
  movements: RestMovement[],
  fromMovementKey: string | null,
  unit: WeightUnit = 'kg',
): RestNextSet | null {
  const start = Math.max(
    0,
    movements.findIndex((movement) => movement.key === fromMovementKey),
  );
  const ordered = [...movements.slice(start), ...movements.slice(0, start)];
  for (const movement of ordered) {
    const index = movement.sets.findIndex((item) => !item.completed);
    if (index < 0) continue;
    const item = movement.sets[index];
    const number = setNumberLabels(movement.sets)[index];
    const kindLabel = SET_KINDS.find((option) => option.kind === setKindOf(item))?.label;
    return {
      movementKey: movement.key,
      setKey: item.key,
      exercise: movement.exercise.name,
      set: /^\d+$/.test(number) ? `Set ${number}` : (kindLabel ?? 'Next set'),
      target:
        movement.exercise.kind === 'strength' && (item.weight_kg || item.reps)
          ? setLabel(item, unit)
          : null,
    };
  }
  return null;
}

/** "+0:12": how long ago the rest ended. */
export function restOvertimeLabel(endedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - endedAt) / 1000));
  return `+${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
