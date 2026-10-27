import type { Exercise, ExerciseCreateInput, ExerciseKind, WorkoutCategory } from './types';

export interface ExerciseCreationDraft {
  name: string;
  category: WorkoutCategory | '';
  kind: ExerciseKind;
  muscle_group: string;
  equipment: string;
  muscle_set_credit: 0.5 | 1;
}

export function prepareExerciseInput(
  draft: ExerciseCreationDraft,
  exercises: Pick<Exercise, 'name'>[],
): ExerciseCreateInput {
  const name = draft.name.trim();
  const muscleGroup = draft.muscle_group.trim();
  const equipment = draft.equipment.trim();
  if (!name) throw new Error('Enter an exercise name.');
  if (name.length > 160) throw new Error('Exercise names must be 160 characters or fewer.');
  if (!draft.category) throw new Error('Choose an exercise category.');
  if (!muscleGroup) throw new Error('Enter a muscle group.');
  if (muscleGroup.length > 100 || equipment.length > 100) {
    throw new Error('Muscle group and equipment must each be 100 characters or fewer.');
  }
  if (exercises.some((exercise) => exercise.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new Error('An exercise with that name already exists. Choose it from the exercise list.');
  }
  return {
    name,
    category: draft.category,
    kind: draft.kind,
    muscle_group: muscleGroup,
    equipment: equipment || null,
    ...(draft.kind !== 'cardio' && draft.category !== 'cardio'
      ? { muscle_set_credit: draft.muscle_set_credit }
      : {}),
  };
}
