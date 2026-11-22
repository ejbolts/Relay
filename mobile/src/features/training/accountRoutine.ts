import type {
  ExerciseHistoryBaseline,
  TrackedSet,
  TrackedWorkout,
  WorkoutRecommendation,
  WorkoutTypeExercises,
} from '../../../../frontend/src/types';
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

// The same factor as KG_TO_LB in frontend/src/weightUnits.ts. Stored weights stay in kg.
const KG_TO_LB = 2.2046226218;

function previousSet(set: TrackedSet, unit: 'kg' | 'lb') {
  const parts: string[] = [];
  if (set.weight_kg != null) {
    const weight = unit === 'kg' ? set.weight_kg : set.weight_kg * KG_TO_LB;
    parts.push(`${Number(weight.toFixed(1))} ${unit}`);
  }
  if (set.reps != null) parts.push(`${set.reps} reps`);
  if (set.duration_seconds != null) parts.push(`${set.duration_seconds} s`);
  if (set.distance_km != null) parts.push(`${set.distance_km} km`);
  return parts.join(' × ') || 'Completed';
}

/** The last set that was actually performed: warm-ups and unticked rows are not history. */
function lastWorkingSet(sets: TrackedSet[]) {
  return [...sets]
    .sort((left, right) => right.order_index - left.order_index)
    .find((set) => set.completed && !set.warmup);
}

/**
 * The next workout as the read-only preview shows it. Like Up next on the web
 * (splitDayTemplate in frontend/src/upNext.ts), it prefers the split day's plan, then the
 * exercises saved to the workout type, then the last workout of that type.
 *
 * `recent` holds the loaded history window, newest first. `older` condenses everything before
 * it, so a lift last trained months ago still shows its previous set.
 */
export function accountRoutine(
  next: WorkoutRecommendation | null,
  saved: WorkoutTypeExercises[],
  recent: TrackedWorkout[],
  older: ExerciseHistoryBaseline[],
  unit: 'kg' | 'lb',
): RoutineView {
  if (!next || next.needs_split_update || next.workout_type?.archived) {
    return {
      name: 'Up next',
      empty: next ? 'Update your training split in Relay.' : 'No workout planned.',
      exercises: [],
    };
  }
  if (next.is_rest_day)
    return { name: 'Rest day', empty: 'No exercises scheduled today.', exercises: [] };

  const type = next.workout_type;
  const planned = next.routine_day?.movements;
  const savedPlan = saved.find((item) => item.workout_type_id === (type?.id ?? next.category));
  const plan = planned?.length ? planned : savedPlan?.movements;
  const latest = recent.find(
    (workout) =>
      workout.category === next.category &&
      (workout.workout_type_id ?? null) === (type?.is_custom ? type.id : null) &&
      workout.movements.length > 0 &&
      (next.category !== 'cardio' ||
        type?.is_custom ||
        workout.movements.some((m) => m.exercise.kind === 'cardio')),
  );
  const rows = plan?.length
    ? plan
    : [...(latest?.movements ?? [])].sort((left, right) => left.order_index - right.order_index);

  const lastSets = new Map<string, TrackedSet>();
  for (const workout of recent) {
    for (const movement of [...workout.movements].reverse()) {
      if (lastSets.has(movement.exercise.id)) continue;
      const set = lastWorkingSet(movement.sets);
      if (set) lastSets.set(movement.exercise.id, set);
    }
  }
  for (const baseline of older) {
    if (lastSets.has(baseline.exercise_id)) continue;
    const set = baseline.latest && lastWorkingSet(baseline.latest.sets);
    if (set) lastSets.set(baseline.exercise_id, set);
  }

  return {
    name: next.session_name,
    empty: 'No exercises planned yet.',
    exercises: rows.map((movement) => {
      const range = 'rep_range' in movement ? movement.rep_range : undefined;
      const repCounts = movement.sets.flatMap((s) => (s.reps == null ? [] : [s.reps]));
      const min = range?.min ?? Math.min(...repCounts);
      const max = range?.max ?? Math.max(...repCounts);
      const previous = lastSets.get(movement.exercise.id);
      const name = movement.exercise.name;
      return {
        name,
        sets: movement.sets.length,
        reps: Number.isFinite(min) ? (min === max ? String(min) : `${min}–${max}`) : undefined,
        previous: previous ? previousSet(previous, unit) : null,
        image: sampleRoutine.exercises.find(
          (item) => item.name.toLowerCase() === name.toLowerCase(),
        )?.image,
      };
    }),
  };
}
