import type {
  Exercise,
  ExerciseCreateInput,
  ExerciseKind,
  MuscleSetCreditInput,
  WorkoutCategory,
} from './types';

export interface ExerciseCreationDraft {
  name: string;
  category: WorkoutCategory | '';
  kind: ExerciseKind;
  muscle_group: string;
  equipment: string;
  muscle_set_credits: MuscleSetCreditInput[];
}

export function prepareExerciseInput(
  draft: ExerciseCreationDraft,
  exercises: Pick<Exercise, 'name'>[],
): ExerciseCreateInput {
  const name = draft.name.trim();
  const strength = draft.kind !== 'cardio' && draft.category !== 'cardio';
  const credits = draft.muscle_set_credits.map((credit) => ({
    ...credit,
    muscle_name: credit.muscle_name.trim(),
  }));
  const muscleGroup = strength ? (credits[0]?.muscle_name ?? '') : draft.muscle_group.trim();
  const equipment = draft.equipment.trim();
  if (!name) throw new Error('Enter an exercise name.');
  if (name.length > 160) throw new Error('Exercise names must be 160 characters or fewer.');
  if (!draft.category) throw new Error('Choose an exercise category.');
  if (strength) {
    if (!credits.length || credits.some((credit) => !credit.muscle_name)) {
      throw new Error('Choose a muscle for each target.');
    }
    if (credits.some((credit) => credit.muscle_name.length > 100)) {
      throw new Error('Muscle names must be 100 characters or fewer.');
    }
    if (
      new Set(credits.map((credit) => credit.muscle_name.toLowerCase())).size !== credits.length
    ) {
      throw new Error('Choose each target muscle only once.');
    }
  } else if (!muscleGroup) throw new Error('Enter a muscle group.');
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
    ...(strength ? { muscle_set_credits: credits } : {}),
  };
}
