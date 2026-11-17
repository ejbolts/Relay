import { exerciseEquipment } from './exerciseEquipment';
import type { Exercise, MuscleSetCreditInput } from './types';

const aliases: Record<string, string> = {
  'upper back': 'mid / upper back',
  'upper pectorals': 'pectorals',
  'anterior deltoids': 'front delts',
  'lateral deltoids': 'side delts',
  'upper trapezius': 'upper traps',
};
const clean = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const isCardio = (exercise: Exercise) =>
  exercise.kind === 'cardio' || exercise.category === 'cardio';

/** The exercise's configured muscles with their set credit, full credits first. */
function credits(exercise: Exercise): { muscle_name: string; sets: number }[] {
  const listed = exercise.default_muscle_set_credits?.length
    ? exercise.default_muscle_set_credits
    : exercise.muscle_contributions.length && !isCardio(exercise)
      ? exercise.muscle_contributions
          .filter((item) => !['External rotators', 'Brachialis'].includes(item.muscle_name))
          .map((item) => ({ muscle_name: item.muscle_name, sets: item.contribution_factor }))
      : [{ muscle_name: exercise.muscle_group.trim(), sets: 1 }];
  // A stable sort keeps the saved order within full and within partial credits.
  return [...listed].sort((a, b) => Number(b.sets >= 1) - Number(a.sets >= 1));
}

const muscleKey = (name: string) => aliases[clean(name)] ?? clean(name);

function muscles(exercise: Exercise): string[] {
  return [...new Set(credits(exercise).map((item) => muscleKey(item.muscle_name)))].sort();
}

const equipmentKey = (exercise: Exercise) => clean(exerciseEquipment(exercise.equipment));

export function canMergeExercises(source: Exercise, target: Exercise): boolean {
  return (
    source.is_custom &&
    source.id !== target.id &&
    source.kind === target.kind &&
    equipmentKey(source) === equipmentKey(target) &&
    JSON.stringify(muscles(source)) === JSON.stringify(muscles(target))
  );
}

/** What a custom exercise must change before it can merge into the target. */
export interface MergeChanges {
  /** Equipment as shown to the user, when it differs. */
  equipment: { from: string; to: string } | null;
  /** Muscle lists as shown to the user, when they differ; half credits end in "½". */
  muscles: { from: string[]; to: string[] } | null;
  /** The update that makes the custom exercise match the target. */
  update: { equipment?: string | null; muscle_set_credits?: MuscleSetCreditInput[] };
}

const muscleLabel = (item: { muscle_name: string; sets: number }) =>
  item.sets >= 1 ? item.muscle_name : `${item.muscle_name} ½`;

/**
 * The changes that would let `source` merge into `target`: null when they can never merge
 * (different kinds, the same exercise, an official source, or cardio with different muscles),
 * and no listed differences when they already match.
 */
export function mergeChanges(source: Exercise, target: Exercise): MergeChanges | null {
  if (!source.is_custom || source.id === target.id || source.kind !== target.kind) return null;
  const sameEquipment = equipmentKey(source) === equipmentKey(target);
  const sameMuscles = JSON.stringify(muscles(source)) === JSON.stringify(muscles(target));
  // Cardio has no muscle credits to change.
  if (!sameMuscles && (isCardio(source) || isCardio(target))) return null;
  return {
    equipment: sameEquipment
      ? null
      : { from: source.equipment?.trim() || 'None', to: target.equipment?.trim() || 'None' },
    muscles: sameMuscles
      ? null
      : { from: credits(source).map(muscleLabel), to: credits(target).map(muscleLabel) },
    update: {
      ...(!sameEquipment && { equipment: target.equipment }),
      ...(!sameMuscles && {
        muscle_set_credits: credits(target).map((item) => ({
          muscle_name: item.muscle_name,
          sets: item.sets >= 1 ? 1 : 0.5,
        })),
      }),
    },
  };
}

/** How many details differ, for listing the closest exercises first. */
export function mergeDistance(source: Exercise, target: Exercise): number {
  const mine = muscles(source);
  const theirs = muscles(target);
  const shared = mine.filter((name) => theirs.includes(name)).length;
  return (
    (equipmentKey(source) === equipmentKey(target) ? 0 : 1) +
    (mine.length - shared) +
    (theirs.length - shared)
  );
}
