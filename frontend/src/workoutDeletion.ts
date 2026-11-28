import type { FinishedWorkout } from './finishedWorkoutQueue';
import { isPendingWorkoutId } from './pendingWorkoutPreview';
import type { Exercise, HeatmapDay, WorkoutCategory } from './types';

// Plain functions with no React or browser APIs: the web and the native app (mobile/) both
// decide here whether a saved workout can change and how its deletion shows before it is sent.

/** Shown when a workout still waiting to sync is edited or deleted. */
export const WORKOUT_SYNCING_MESSAGE = 'You can change this workout once it has synced.';

/** The saved workouts that have changes on this device still waiting to reach the server. */
export function queuedWorkoutIds(items: readonly Pick<FinishedWorkout, 'pendingSave'>[]) {
  return new Set(
    items.flatMap((item) => (item.pendingSave.workoutId ? [item.pendingSave.workoutId] : [])),
  );
}

/**
 * Whether a workout can't be edited or deleted yet: one the server hasn't confirmed, or one with
 * changes still waiting to sync, which would otherwise land over (or bring back) the change.
 */
export function workoutBlockedWhileSyncing(id: string, queued: ReadonlySet<string>): boolean {
  return isPendingWorkoutId(id) || queued.has(id);
}

type CalendarWorkout = HeatmapDay['workouts'][number];

/** An exercise's category and kind by its name, from the exercise library, as the server reads them. */
export type ExerciseByName = (
  name: string,
) => Pick<Exercise, 'category' | 'kind'> | null | undefined;

/**
 * The server's `display_categories` (backend/app/tracker.py): one strength colour for the day
 * (several strength categories collapse to full body) plus cardio when there was any. A
 * cardio-category workout with strength exercises counts as its strength category.
 */
function displayCategories(
  items: readonly { category: WorkoutCategory; movements: WorkoutCategory[] }[],
): WorkoutCategory[] {
  let cardio = false;
  const strength: WorkoutCategory[] = [];
  for (const item of items) {
    const kinds = new Set(item.movements);
    cardio ||= kinds.has('cardio');
    const nonCardio = [...kinds].filter((category) => category !== 'cardio');
    if (nonCardio.length) {
      strength.push(
        item.category !== 'cardio'
          ? item.category
          : nonCardio.length === 1
            ? nonCardio[0]
            : 'full_body',
      );
    } else if (item.category === 'cardio') cardio = true;
    else strength.push(item.category);
  }
  const unique = [...new Set(strength)];
  return [
    ...(unique.length > 1 ? ['full_body' as const] : unique),
    ...(cardio ? ['cardio' as const] : []),
  ];
}

/**
 * A day's categories and workout types for the workouts it keeps, built as the server builds
 * them, or null when an exercise isn't in the library (the calendar data has names only).
 */
function exactDayLook(kept: readonly CalendarWorkout[], lookup: ExerciseByName) {
  const read = kept.map((workout) => {
    const exercises = (workout.exercises ?? []).map((exercise) => lookup(exercise.exercise_name));
    return exercises.every(Boolean)
      ? { workout, exercises: exercises as Pick<Exercise, 'category' | 'kind'>[] }
      : null;
  });
  if (read.some((item) => !item)) return null;
  const items = read.map((item) => ({
    workout: item!.workout,
    category: item!.workout.category,
    movements: item!.exercises.map((exercise) => exercise.category),
    cardioKind: item!.exercises.some((exercise) => exercise.kind === 'cardio'),
  }));
  // The server's `display_types`: a custom type, plus the cardio type when it had cardio
  // exercises; otherwise the built-in types of the workout's own categories.
  const typeIds = new Set<string>();
  for (const item of items) {
    const custom = item.workout.workout_type_id ?? item.workout.workout_type?.id;
    if (custom) {
      typeIds.add(custom);
      if (item.cardioKind) typeIds.add('cardio');
    } else displayCategories([item]).forEach((category) => typeIds.add(category));
  }
  return {
    categories: displayCategories(items),
    typeIds,
  };
}

/**
 * Without the exercise library: the kept workouts' own categories, collapsed as the server does.
 * Cardio stays when a kept workout is a cardio one, or when no deleted workout was (so a kept
 * workout's cardio exercises brought it).
 */
function approximateDayLook(
  day: HeatmapDay,
  kept: readonly CalendarWorkout[],
  gone: readonly CalendarWorkout[],
  lookup?: ExerciseByName,
) {
  const strength = [
    ...new Set(kept.filter((item) => item.category !== 'cardio').map((item) => item.category)),
  ];
  // Cardio the day had stays only if no deleted workout could have brought it: a cardio one, or
  // one with a cardio exercise the library knows.
  const broughtCardio = (item: CalendarWorkout) =>
    item.category === 'cardio' ||
    (item.exercises ?? []).some((exercise) => lookup?.(exercise.exercise_name)?.kind === 'cardio');
  const cardio =
    kept.some((item) => item.category === 'cardio') ||
    (day.categories.includes('cardio') && !gone.some(broughtCardio));
  const categories: WorkoutCategory[] = [
    ...(strength.length > 1 ? ['full_body' as const] : strength),
    ...(cardio ? ['cardio' as const] : []),
  ];
  const typeIds = new Set<string>(cardio ? ['cardio'] : []);
  for (const item of kept) {
    const custom = item.workout_type_id ?? item.workout_type?.id;
    typeIds.add(custom ?? item.category);
  }
  return { categories, typeIds };
}

/**
 * The calendar's days without the given workouts, as they show while a deletion waits for its
 * Undo: a day keeps its other workouts, with its counts, categories and types built again as the
 * server builds them (exactly when `exerciseByName` knows every exercise, closely otherwise), and
 * a day left with none drops out. A kept workout never loses its colour.
 */
export function heatmapWithoutWorkouts(
  days: readonly HeatmapDay[],
  ids: readonly string[],
  exerciseByName?: ExerciseByName,
): HeatmapDay[] {
  if (!ids.length) return days as HeatmapDay[];
  const removed = new Set(ids);
  return days.flatMap((day) => {
    const workouts = Array.isArray(day.workouts) ? day.workouts : [];
    if (!workouts.some((workout) => removed.has(workout.id))) return [day];
    const kept = workouts.filter((workout) => !removed.has(workout.id));
    if (!kept.length) return [];
    const gone = workouts.filter((workout) => removed.has(workout.id));
    const look =
      (exerciseByName && exactDayLook(kept, exerciseByName)) ??
      approximateDayLook(day, kept, gone, exerciseByName);
    const types = day.workout_types?.filter((type) => look.typeIds.has(type.id));
    return [
      {
        ...day,
        workouts: kept,
        workout_count: Math.max(kept.length, day.workout_count - gone.length),
        set_count: Math.max(
          0,
          day.set_count -
            gone.reduce(
              (sum, workout) =>
                sum +
                (workout.exercises ?? []).reduce((sets, exercise) => sets + exercise.set_count, 0),
              0,
            ),
        ),
        categories: look.categories,
        // Without a matching type the calendar falls back to the categories.
        ...(day.workout_types ? { workout_types: types?.length ? types : undefined } : {}),
      },
    ];
  });
}
