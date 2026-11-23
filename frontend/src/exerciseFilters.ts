// Package-free, so the native app can share it (see AGENTS.md "Web and mobile parity").
import { exerciseEquipment } from './exerciseEquipment';
import type { Exercise, WorkoutCategory } from './types';

/** The exercise picker's body parts, in the order its Body part filter offers them. */
export const EXERCISE_BODY_PARTS: readonly WorkoutCategory[] = [
  'push',
  'pull',
  'lower',
  'upper',
  'full_body',
  'cardio',
  'other',
];

/**
 * Whether an exercise passes the picker's Body part and Equipment filters ('all' and '' show
 * everything). Each app adds its own rules for hidden, excluded or custom-only exercises.
 */
export function matchesExerciseFilters(
  exercise: Pick<Exercise, 'category' | 'equipment'>,
  bodyPart: WorkoutCategory | 'all',
  equipment: string,
): boolean {
  return (
    (bodyPart === 'all' || exercise.category === bodyPart) &&
    (!equipment || exerciseEquipment(exercise.equipment) === equipment)
  );
}
