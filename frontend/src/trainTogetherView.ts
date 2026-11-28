import type { SessionTemplate } from './trainingSummary';
import {
  exercisesToCopy,
  partnerSetOnSameLift,
  partnerSummary,
  type PartnerLastSet,
  type TrainPartnerWorkout,
} from './trainTogether';
import type { Exercise } from './types';
import { formatWeight, type WeightUnit } from './weightUnits';
import { workoutNameForCategory } from './workoutCategory';

// Train together, beside trainTogether.ts: the words the live deck and pace strip show for a
// partner's workout, and starting your own from it. Plain TypeScript with no packages or browser APIs, so the web and the app share it.

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

/** A partner's set in the viewer's unit: "80 kg × 8", "8 reps", "80 kg", "30 min · 4.8 km". */
export function partnerSetLabel(set: PartnerLastSet, unit: WeightUnit): string {
  if (set.duration_seconds || set.distance_km) {
    return [
      set.duration_seconds ? `${Math.round(set.duration_seconds / 60)} min` : null,
      set.distance_km ? `${Number(set.distance_km.toFixed(2))} km` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  const weight =
    set.weight_kg !== null && set.weight_kg > 0 ? formatWeight(set.weight_kg, unit) : null;
  if (weight && set.reps !== null) return `${weight} × ${set.reps}`;
  if (weight) return weight;
  if (set.reps !== null) return `${set.reps} ${set.reps === 1 ? 'rep' : 'reps'}`;
  return 'Set done';
}

/** The deck's live line for a partner: "Bench Press · 80 kg × 8", or "Bench Press · Starting". */
export function partnerTicker(
  workout: TrainPartnerWorkout | null,
  unit: WeightUnit,
  now: number,
): string {
  if (!workout) return 'No workout open';
  const summary = partnerSummary(workout, now);
  if (!summary.movementKey) return 'Starting';
  return `${summary.name} · ${summary.lastSet ? partnerSetLabel(summary.lastSet, unit) : 'Starting'}`;
}

/** The pace strip on your exercise card: the partner's latest set on this lift and its number. */
export function partnerPace(
  workout: TrainPartnerWorkout,
  myExerciseId: string,
  unit: WeightUnit,
): { label: string; setNumber: number } | null {
  const same = partnerSetOnSameLift(workout, myExerciseId);
  if (!same) return null;
  const movement = workout.draft.movements.find((item) => item.key === same.movementKey);
  const done = movement?.sets.filter((item) => item.completed) ?? [];
  const index = done.findIndex((item) => item.key === same.set.key);
  return {
    label: partnerSetLabel(
      {
        weight_kg: same.set.weight_kg ?? null,
        reps: same.set.reps ?? null,
        duration_seconds: same.set.duration_seconds ?? null,
        distance_km: same.set.distance_km ?? null,
      },
      unit,
    ),
    setNumber: index < 0 ? done.length : index + 1,
  };
}
