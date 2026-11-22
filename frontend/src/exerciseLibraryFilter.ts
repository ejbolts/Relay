import { exerciseEquipment } from './exerciseEquipment';
import { exerciseSearchAllowsTypos, exerciseSearchScore } from './exerciseSearch';
import type { Exercise, ExerciseLibrarySummary } from './types';

/** The exercise library's sort orders, by index. */
export const EXERCISE_LIBRARY_SORTS = ['Recent first', 'A–Z', 'Most improved'] as const;

/** The muscles an exercise counts sets for, or its muscle group when it has no set credits. */
export function exerciseMuscles(exercise: Exercise): string[] {
  return (
    exercise.muscle_set_credits
      ?.filter((credit) => credit.sets > 0)
      .map((credit) => credit.muscle_name) ?? [exercise.muscle_group].filter(Boolean)
  );
}

/** Every muscle the library can filter by, A–Z. */
export function exerciseLibraryMuscles(exercises: Exercise[]): string[] {
  return [
    ...new Set(
      exercises.flatMap(
        (exercise) =>
          exercise.default_muscle_set_credits?.map((credit) => credit.muscle_name) ??
          exerciseMuscles(exercise),
      ),
    ),
  ].sort();
}

export interface ExerciseLibraryFilters {
  query: string;
  /** A muscle, or 'All'. */
  muscle: string;
  /** An equipment name from `exerciseEquipment`, or '' for all. */
  equipment: string;
  customOnly: boolean;
  /** Lists only hidden exercises, while there are any. */
  hiddenOnly: boolean;
  /** An index into `EXERCISE_LIBRARY_SORTS`. */
  sort: number;
}

/** The library's exercises that match the search and filters, in the chosen order. */
export function filterExerciseLibrary(
  exercises: Exercise[],
  summaries: ReadonlyMap<string, ExerciseLibrarySummary>,
  { query, muscle, equipment, customOnly, hiddenOnly, sort }: ExerciseLibraryFilters,
): Exercise[] {
  const showHidden = hiddenOnly && exercises.some((exercise) => exercise.hidden);
  const typos = exerciseSearchAllowsTypos(exercises, query);
  return exercises
    .filter(
      (exercise) =>
        Boolean(exercise.hidden) === showHidden &&
        (!customOnly || exercise.is_custom) &&
        (muscle === 'All' || exerciseMuscles(exercise).includes(muscle)) &&
        (!equipment || exerciseEquipment(exercise.equipment) === equipment) &&
        exerciseSearchScore(exercise, query, typos) !== null,
    )
    .sort((a, b) => {
      const first = summaries.get(a.id),
        second = summaries.get(b.id);
      if (sort === 1) return a.name.localeCompare(b.name);
      if (sort === 2) {
        const change = (second?.change_percent ?? -Infinity) - (first?.change_percent ?? -Infinity);
        if (change && !Number.isNaN(change)) return change;
      } else {
        const recent = (second?.last_date ?? '').localeCompare(first?.last_date ?? '');
        if (recent) return recent;
      }
      return a.name.localeCompare(b.name);
    });
}
