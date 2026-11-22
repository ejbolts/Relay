import {
  latestTopSets,
  setLabel,
  type SessionTemplateExercise,
} from '../../../../frontend/src/trainingSummary';
import type {
  TrackedWorkout,
  WorkoutRecommendation,
  WorkoutType,
  WorkoutTypeExercises,
} from '../../../../frontend/src/types';
import { upNextSession } from '../../../../frontend/src/upNextSession';
import type { WeightUnit } from '../../../../frontend/src/weightUnits';
import { isCompletedWorkingSet } from '../../../../frontend/src/workoutSets';
import { sampleRoutine } from './sampleRoutine';

export interface RoutineView {
  name: string;
  empty?: string;
  exercises: {
    name: string;
    sets: number;
    reps?: string;
    previous: string | null;
    image?: number;
  }[];
}

function repRange(reps: (number | null)[]) {
  const counts = reps.filter((value): value is number => value != null);
  if (!counts.length) return undefined;
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return min === max ? String(min) : `${min}–${max}`;
}

/**
 * The next workout as the read-only preview shows it. Which workout, its exercises and the empty
 * states come from the web's own rule (`upNextSession` in frontend/src/upNextSession.ts), and
 * each exercise's previous set is the top set Home's Up next shows (`latestTopSets`). Only the
 * presentation below is the app's.
 */
export function accountRoutine({
  recommendation,
  types,
  saved,
  workouts,
  unit,
  today,
}: {
  recommendation: WorkoutRecommendation | null;
  types: WorkoutType[];
  saved: WorkoutTypeExercises[];
  workouts: TrackedWorkout[];
  unit: WeightUnit;
  today: string;
}): RoutineView {
  const next = upNextSession({
    recommendation,
    workouts,
    types,
    savedExercises: Object.fromEntries(saved.map((item) => [item.workout_type_id, item.movements])),
    today,
    weightUnit: unit,
  });
  if (!next.recommendation) return { name: 'Up next', empty: 'No workout planned.', exercises: [] };
  if (next.needsSplitUpdate)
    return { name: 'Up next', empty: 'Update your training split in Relay.', exercises: [] };
  if (next.isRestDay)
    return { name: 'Rest day', empty: 'No exercises scheduled today.', exercises: [] };

  const latest = latestTopSets(workouts, today);
  const source = next.template?.sourceWorkout.movements ?? [];
  const row = (item: SessionTemplateExercise) => {
    // A plan has its own sets; a repeated workout shows what was done last time.
    const done = source
      .find((movement) => movement.exercise.id === item.exercise.id)
      ?.sets.filter(isCompletedWorkingSet);
    const sets = item.plannedSets ?? done ?? [];
    const top = latest.get(item.exercise.id);
    const name = item.exercise.name;
    return {
      name,
      sets: sets.length,
      reps: item.repRange
        ? `${item.repRange.min}–${item.repRange.max}`
        : repRange(sets.map((set) => set.reps)),
      previous:
        item.exercise.kind === 'cardio'
          ? item.summary === '–'
            ? null
            : item.summary
          : top
            ? setLabel(top, unit)
            : null,
      image: sampleRoutine.exercises.find(
        (sample) => sample.name.toLowerCase() === name.toLowerCase(),
      )?.image,
    };
  };
  return {
    name: next.recommendation.session_name,
    empty: 'No exercises planned yet.',
    exercises: (next.template?.exercises ?? []).map(row),
  };
}
