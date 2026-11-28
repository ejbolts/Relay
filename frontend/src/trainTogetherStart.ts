import type { SessionTemplate } from './trainingSummary';
import { exercisesToCopy, type TrainPartnerWorkout } from './trainTogether';
import type { Exercise } from './types';
import { workoutNameForCategory } from './workoutCategory';

// Train together, beside trainTogether.ts: naming a partner's live workout and starting your own
// from it. Plain TypeScript with no packages or browser APIs, so the web and the app share it.

/** A partner's live workout's name: theirs, or the automatic one for its category ("Push day"). */
export function partnerWorkoutName(workout: Pick<TrainPartnerWorkout, 'draft'>): string {
  return workout.draft.name?.trim() || workoutNameForCategory(workout.draft.category);
}

/** The exercises a partner's workout uses, in its order, each with whether you have it. */
export function partnerExerciseChips(
  workout: TrainPartnerWorkout,
): { id: string; name: string; matched: boolean }[] {
  const byId = new Map(workout.exercises.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const chips: { id: string; name: string; matched: boolean }[] = [];
  for (const movement of workout.draft.movements ?? []) {
    const exercise = byId.get(movement.exerciseId);
    if (!exercise || seen.has(exercise.id)) continue;
    seen.add(exercise.id);
    chips.push({ id: exercise.id, name: exercise.name, matched: !!exercise.same_as_exercise_id });
  }
  return chips;
}

/**
 * "Start with Sam's exercises": a template of your own matching exercises in the partner's
 * order, and the names you have no match for. Exercises you have since deleted or hidden count as
 * unmatched. The workout starts in the partner's category, with no plan, so each exercise
 * suggests your own last sets as any workout does.
 */
export function partnerStartTemplate(
  workout: TrainPartnerWorkout,
  myExercises: Exercise[],
  date: string,
): { template: SessionTemplate; unmatched: string[] } {
  const { exerciseIds, unmatched } = exercisesToCopy(workout);
  const mine = new Map(myExercises.map((item) => [item.id, item]));
  const exercises: SessionTemplate['exercises'] = [];
  const missing = [...unmatched];
  for (const id of exerciseIds) {
    const exercise = mine.get(id);
    if (exercise) exercises.push({ exercise, topSet: null, summary: '' });
    else {
      const partnerName = workout.exercises.find((item) => item.same_as_exercise_id === id)?.name;
      if (partnerName && !missing.includes(partnerName)) missing.push(partnerName);
    }
  }
  const category = workout.draft.category;
  return {
    template: {
      category,
      sourceWorkout: {
        id: 'train-together-template',
        name: partnerWorkoutName(workout),
        workout_date: date,
        category,
        workout_type_id: null,
        workout_type: null,
        notes: null,
        duration_minutes: null,
        start_time: null,
        end_time: null,
        is_sample: false,
        created_at: `${date}T00:00:00Z`,
        updated_at: `${date}T00:00:00Z`,
        movements: [],
      },
      exercises,
    },
    unmatched: missing,
  };
}

/** The toast after starting with a partner's exercises when some had no match. */
export function unmatchedExercisesNotice(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "1 exercise isn't in your library"
    : `${count} exercises aren't in your library`;
}
