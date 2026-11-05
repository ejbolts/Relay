import { exerciseEquipment } from './exerciseEquipment';
import type { Exercise } from './types';

const aliases: Record<string, string> = {
  'upper back': 'mid / upper back',
  'upper pectorals': 'pectorals',
  'anterior deltoids': 'front delts',
  'lateral deltoids': 'side delts',
  'upper trapezius': 'upper traps',
};
const clean = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

function muscles(exercise: Exercise): string[] {
  const credits = exercise.default_muscle_set_credits;
  const names = credits?.length
    ? credits.map((item) => item.muscle_name)
    : exercise.muscle_contributions.length &&
        exercise.kind !== 'cardio' &&
        exercise.category !== 'cardio'
      ? exercise.muscle_contributions
          .map((item) => item.muscle_name)
          .filter((name) => !['External rotators', 'Brachialis'].includes(name))
      : [];
  return [
    ...new Set(
      (names.length ? names : [exercise.muscle_group]).map(
        (name) => aliases[clean(name)] ?? clean(name),
      ),
    ),
  ].sort();
}

export function canMergeExercises(source: Exercise, target: Exercise): boolean {
  return (
    source.is_custom &&
    source.id !== target.id &&
    source.kind === target.kind &&
    clean(exerciseEquipment(source.equipment)) === clean(exerciseEquipment(target.equipment)) &&
    JSON.stringify(muscles(source)) === JSON.stringify(muscles(target))
  );
}
