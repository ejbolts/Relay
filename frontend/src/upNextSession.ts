import { routineSessionTemplate, typeSessionTemplate } from './routines';
import { CATEGORY_LABELS, sessionTemplateFor, type SessionTemplate } from './trainingSummary';
import type {
  RoutineDay,
  RoutineMovement,
  TrackedWorkout,
  WorkoutCategory,
  WorkoutRecommendation,
  WorkoutType,
} from './types';
import type { WeightUnit } from './weightUnits';

// Plain functions with no React or browser APIs: the web's useUpNextSession and the native app
// (mobile/) both import these, so Up next is decided by one rule. Keep this file and the
// modules it imports free of packages and DOM access; the mobile checks build them too.

/**
 * What a split day starts with: the day's own plan, then the exercises saved to its workout
 * type, then the last session of that type. Up next and a planned calendar day both use it, so
 * either starts the same workout.
 */
export function splitDayTemplate({
  routineDay,
  type,
  category,
  name,
  workouts,
  savedExercises,
  today,
  weightUnit,
}: {
  routineDay: RoutineDay | null | undefined;
  type: WorkoutType | null | undefined;
  category: WorkoutCategory;
  name: string;
  workouts: TrackedWorkout[];
  savedExercises: Record<string, RoutineMovement[]>;
  today: string;
  weightUnit: WeightUnit;
}): SessionTemplate | null {
  if (routineDay?.movements.length)
    return routineSessionTemplate(routineDay, name, today, weightUnit);
  const saved = type ? savedExercises[type.id] : undefined;
  if (type && saved?.length) return typeSessionTemplate(type, saved, name, today, weightUnit);
  return sessionTemplateFor(
    workouts,
    category,
    today,
    weightUnit,
    type?.is_custom ? type.id : null,
  );
}

/**
 * The recommended next session: the recommendation (unless its type was removed), its label and
 * the workout to pre-fill. Home's Up next card, the Start menu and the native app show this.
 */
export function upNextSession({
  recommendation,
  workouts,
  types,
  savedExercises,
  today,
  weightUnit,
}: {
  recommendation: WorkoutRecommendation | null | undefined;
  workouts: TrackedWorkout[];
  types: WorkoutType[];
  savedExercises: Record<string, RoutineMovement[]>;
  today: string;
  weightUnit: WeightUnit;
}) {
  const typeId = recommendation?.workout_type?.id ?? recommendation?.category;
  const type = recommendation?.workout_type ?? types.find((item) => item.id === typeId);
  const archived = type?.archived || types.find((item) => item.id === typeId)?.archived;
  const active = archived && !recommendation?.split_name ? null : (recommendation ?? null);
  const isRestDay = active?.is_rest_day === true;
  const needsSplitUpdate =
    active?.needs_split_update === true || !!(active?.split_name && archived);
  const template =
    !active || isRestDay || needsSplitUpdate
      ? null
      : splitDayTemplate({
          routineDay: active.routine_day,
          type,
          category: active.category,
          name: active.session_name,
          workouts,
          savedExercises,
          today,
          weightUnit,
        });
  const mainLabel = active
    ? isRestDay
      ? 'Rest'
      : (type?.name ?? (active.category === 'cardio' ? 'Cardio' : CATEGORY_LABELS[active.category]))
    : null;
  // A mixed split day names each of its types: "Upper body + Cardio".
  const extraNames = isRestDay ? [] : (active?.extra_workout_types ?? []).map((item) => item.name);
  const label = mainLabel && [mainLabel, ...extraNames].join(' + ');
  return { recommendation: active, label, template, type, isRestDay, needsSplitUpdate };
}
