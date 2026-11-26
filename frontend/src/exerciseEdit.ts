import type { Exercise, MuscleSetCreditInput } from './types';

/** What an edit sends: only the fields that changed. */
export interface ExerciseEditChanges {
  name?: string;
  equipment?: string | null;
  muscle_set_credits?: MuscleSetCreditInput[];
}

/** Typed text as saved: trimmed, with runs of spaces made one. */
export const cleanExerciseText = (value: string) => value.trim().replace(/\s+/g, ' ');

/** Only custom exercises can be renamed or re-described; any exercise can be hidden. */
export const canEditExercise = (exercise: Pick<Exercise, 'is_custom'>) => exercise.is_custom;

const isCardio = (exercise: Pick<Exercise, 'kind' | 'category'>) =>
  exercise.kind === 'cardio' || exercise.category === 'cardio';

/** Whether an edit can change the exercise's target muscles: custom strength exercises only. */
export const canEditExerciseMuscles = (exercise: Exercise) =>
  exercise.is_custom && !isCardio(exercise);

/** The exercise's target muscles as an edit starts with them, full credits first. */
export function exerciseEditCredits(exercise: Exercise): MuscleSetCreditInput[] {
  const saved = exercise.default_muscle_set_credits?.length
    ? exercise.default_muscle_set_credits
    : exercise.muscle_set_credits?.length
      ? exercise.muscle_set_credits
      : exercise.muscle_group.trim()
        ? [{ muscle_name: exercise.muscle_group.trim(), sets: 1 }]
        : [];
  return saved
    .map((credit): MuscleSetCreditInput => ({
      muscle_name: credit.muscle_name,
      sets: credit.sets >= 1 ? 1 : 0.5,
    }))
    .sort((a, b) => b.sets - a.sets);
}

const creditsKey = (credits: MuscleSetCreditInput[]) =>
  JSON.stringify(
    credits
      .map((credit) => [cleanExerciseText(credit.muscle_name).toLowerCase(), credit.sets])
      .sort(),
  );

/**
 * The changes an edit makes, or null when the name is blank. Muscles are compared as a set, so
 * reordering them is not a change. Throws when a target muscle is missing or chosen twice.
 */
export function exerciseEditChanges(
  exercise: Exercise,
  draft: { name: string; equipment: string; muscle_set_credits?: MuscleSetCreditInput[] },
): ExerciseEditChanges | null {
  const name = cleanExerciseText(draft.name);
  if (!name) return null;
  const equipment = cleanExerciseText(draft.equipment);
  const changes: ExerciseEditChanges = {};
  if (name !== exercise.name) changes.name = name;
  if (equipment !== cleanExerciseText(exercise.equipment ?? ''))
    changes.equipment = equipment || null;
  if (draft.muscle_set_credits && canEditExerciseMuscles(exercise)) {
    const credits = draft.muscle_set_credits.map((credit) => ({
      ...credit,
      muscle_name: cleanExerciseText(credit.muscle_name),
    }));
    if (!credits.length || credits.some((credit) => !credit.muscle_name))
      throw new Error('Choose a muscle for each target.');
    if (new Set(credits.map((credit) => credit.muscle_name.toLowerCase())).size !== credits.length)
      throw new Error('Choose each target muscle only once.');
    if (creditsKey(credits) !== creditsKey(exerciseEditCredits(exercise)))
      changes.muscle_set_credits = credits;
  }
  return changes;
}

/** The confirmation after hiding or showing an exercise. */
export const exerciseHiddenNotice = (hidden: boolean) =>
  hidden ? 'Hidden from exercise lists' : 'Shown in exercise lists';
