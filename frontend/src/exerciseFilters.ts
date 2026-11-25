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

/** Option value for "custom exercises only" in the Equipment filter; equipment names never start with a colon. */
export const CUSTOM_EQUIPMENT_OPTION = ':custom';

/**
 * Whether an exercise passes the picker's Body part, Equipment and Custom filters ('all' and ''
 * show everything). Each app adds its own rules for hidden or excluded exercises.
 */
export function matchesExerciseFilters(
  exercise: Pick<Exercise, 'category' | 'equipment'> & { is_custom?: boolean },
  bodyPart: WorkoutCategory | 'all',
  equipment: string,
  customOnly = false,
): boolean {
  return (
    (!customOnly || Boolean(exercise.is_custom)) &&
    (bodyPart === 'all' || exercise.category === bodyPart) &&
    (!equipment || exerciseEquipment(exercise.equipment) === equipment)
  );
}
