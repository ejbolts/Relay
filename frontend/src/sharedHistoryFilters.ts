import { CATEGORY_LABELS } from './trainingSummary';
import type {
  SharedWorkoutFilterOptions,
  SharedWorkoutFilters,
  SharedWorkoutKind,
  TrackedWorkout,
  WorkoutCategory,
} from './types';

/**
 * The rules of a profile's workout-history filters (workout type, exercise, machine and dates),
 * shared by the web's profile and the app's. Pure: no packages, no browser APIs.
 */

/** No filter set: every shared workout. */
export const NO_SHARED_WORKOUT_FILTERS: SharedWorkoutFilters = {
  category: '',
  exercise_id: '',
  machine_photo_id: '',
  start_date: '',
  end_date: '',
};

/** How many workout filters are set. */
export function sharedWorkoutFilterCount(filters: SharedWorkoutFilters): number {
  return Object.values(filters).filter(Boolean).length;
}

/** The filters that show one day's workouts, as a calendar day or a linked workout opens them. */
export function sharedFiltersOnDay(date: string): SharedWorkoutFilters {
  return { ...NO_SHARED_WORKOUT_FILTERS, start_date: date, end_date: date };
}

/** Whether two sets of filters ask for the same workouts. */
export function sameSharedFilters(a: SharedWorkoutFilters, b: SharedWorkoutFilters): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof SharedWorkoutFilters>;
  return [...keys].every((key) => (a[key] ?? '') === (b[key] ?? ''));
}

/** The one day the filters show, which the calendar marks, or null for a range or no dates. */
export function sharedFiltersDay(filters: SharedWorkoutFilters): string | null {
  return filters.start_date && filters.start_date === filters.end_date ? filters.start_date : null;
}

/** The filters a profile opens with: a linked workout's day, or none. */
export function sharedFiltersForTarget(
  target?: Pick<TrackedWorkout, 'workout_date'> | null,
): SharedWorkoutFilters {
  return target ? sharedFiltersOnDay(target.workout_date) : NO_SHARED_WORKOUT_FILTERS;
}

/** The filters that show every workout with one exercise, as a head-to-head lift opens them. */
export function sharedFiltersForExercise(exerciseId: string): SharedWorkoutFilters {
  return { ...NO_SHARED_WORKOUT_FILTERS, exercise_id: exerciseId };
}

/**
 * The linked workout to open and scroll to, while the filters still show only its day. Choosing
 * any other filter lets the link go.
 */
export function linkedSharedWorkoutId(
  target: Pick<TrackedWorkout, 'id' | 'workout_date'> | null | undefined,
  filters: SharedWorkoutFilters,
): string | undefined {
  return target &&
    filters.start_date === target.workout_date &&
    filters.end_date === target.workout_date &&
    !filters.category &&
    !filters.workout_type_id &&
    !filters.exercise_id &&
    !filters.machine_photo_id
    ? target.id
    : undefined;
}

/** A From date after the To date matches nothing, so nothing is read. */
export function sharedFilterDatesInvalid(filters: SharedWorkoutFilters): boolean {
  return Boolean(filters.start_date && filters.end_date && filters.start_date > filters.end_date);
}

export const SHARED_FILTER_DATES_ERROR = 'From date must not be after To date.';
export const LINKED_WORKOUT_MISSING = 'This workout is no longer available.';

/**
 * Whether a linked workout still needs older pages read: it isn't among those loaded and the
 * server holds more.
 */
export function linkedWorkoutNeedsMore(
  workouts: readonly Pick<TrackedWorkout, 'id'>[],
  linkedId: string | undefined,
  total: number,
): boolean {
  return Boolean(
    linkedId && !workouts.some((workout) => workout.id === linkedId) && workouts.length < total,
  );
}

/** The server query for the filters, on one history tab when the member logs cardio. */
export function sharedWorkoutQuery(
  filters: SharedWorkoutFilters,
  kind?: SharedWorkoutKind,
): SharedWorkoutFilters & { kind?: SharedWorkoutKind } {
  return kind ? { ...filters, kind } : filters;
}

/** The Workout type choice's value: a built-in category, or `custom:<id>` for a custom type. */
export function sharedWorkoutTypeValue(filters: SharedWorkoutFilters): string {
  return filters.workout_type_id ? `custom:${filters.workout_type_id}` : filters.category;
}

/** The filters with a Workout type choice applied; one kind of type replaces the other. */
export function withSharedWorkoutType(
  filters: SharedWorkoutFilters,
  value: string,
): SharedWorkoutFilters {
  if (value.startsWith('custom:')) {
    return { ...filters, category: '', workout_type_id: value.slice(7) };
  }
  const next = { ...filters, category: value as WorkoutCategory | '' };
  delete next.workout_type_id;
  return next;
}

/** The Workout type choices: all types, the built-in categories, then the member's own types. */
export function sharedWorkoutTypeChoices(
  options: SharedWorkoutFilterOptions,
): { value: string; label: string }[] {
  return [
    { value: '', label: 'All types' },
    ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
    ...(options.workout_types ?? [])
      .filter((type) => type.is_custom)
      .map((type) => ({ value: `custom:${type.id}`, label: type.name })),
  ];
}
