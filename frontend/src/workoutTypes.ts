import type { HeatmapDay, WorkoutCategory, WorkoutType, WorkoutTypeColors } from './types';

export const DEFAULT_WORKOUT_TYPES: WorkoutType[] = [
  { id: 'upper', name: 'Upper body', color: '#8b5cf6', is_custom: false, archived: false },
  { id: 'lower', name: 'Lower body', color: '#f59e0b', is_custom: false, archived: false },
  { id: 'push', name: 'Push', color: '#ef476f', is_custom: false, archived: false },
  { id: 'pull', name: 'Pull', color: '#3b82f6', is_custom: false, archived: false },
  { id: 'full_body', name: 'Full body', color: '#14b8a6', is_custom: false, archived: false },
  { id: 'cardio', name: 'Cardio', color: '#22c55e', is_custom: false, archived: false },
  { id: 'other', name: 'Other', color: '#94a3b8', is_custom: false, archived: false },
];

export function builtinTypeColors(types: WorkoutType[]): WorkoutTypeColors {
  return Object.fromEntries(
    DEFAULT_WORKOUT_TYPES.map((type) => [
      type.id,
      types.find((item) => item.id === type.id)?.color ?? type.color,
    ]),
  ) as WorkoutTypeColors;
}

export function effectiveWorkoutType(
  workout: {
    category: WorkoutCategory;
    workout_type_id?: string | null;
    workout_type?: WorkoutType | null;
  },
  types: WorkoutType[] = DEFAULT_WORKOUT_TYPES,
): WorkoutType {
  const custom = workout.workout_type;
  const id =
    workout.workout_type_id ??
    (workout.workout_type_id === undefined ? custom?.id : null) ??
    workout.category;
  return (
    types.find((type) => type.id === id) ??
    custom ??
    DEFAULT_WORKOUT_TYPES.find((type) => type.id === workout.category)!
  );
}

/** A mixed strength/cardio day can have both its named strength type and Cardio. */
export function calendarDayTypes(day: HeatmapDay, types: WorkoutType[]): WorkoutType[] {
  return (
    day.workout_types ?? day.categories.map((category) => effectiveWorkoutType({ category }, types))
  ).map((type) => types.find((item) => item.id === type.id) ?? type);
}

export function calendarLegendTypes(days: HeatmapDay[], types: WorkoutType[]): WorkoutType[] {
  const present = new Map<string, WorkoutType>();
  days.forEach((day) => calendarDayTypes(day, types).forEach((type) => present.set(type.id, type)));
  // Keep the familiar built-in order, then list every custom type present in the loaded history.
  const known = types.filter((type) => present.has(type.id));
  return [
    ...known,
    ...[...present.values()].filter((type) => !types.some((item) => item.id === type.id)),
  ];
}
