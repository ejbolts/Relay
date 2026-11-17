import { useMemo } from 'react';
import { CATEGORY_LABELS, sessionTemplateFor } from './trainingSummary';
import { useWeightUnit } from './trainingPreferencesContext';
import type { TrackedWorkout, WorkoutRecommendation } from './types';
import { localDate } from './utils';
import { useWorkoutTypes } from './workoutTypesContext';
import { routineSessionTemplate, typeSessionTemplate } from './routines';

/**
 * The recommended next session shared by Home's Up next card and the Start menu: the
 * recommendation (unless its type was removed), its label and the last session to pre-fill from.
 */
export function useUpNextSession(
  recommendation: WorkoutRecommendation | null | undefined,
  workouts: TrackedWorkout[],
  today = localDate(),
) {
  const weightUnit = useWeightUnit();
  const { types, savedExercises } = useWorkoutTypes();
  const typeId = recommendation?.workout_type?.id ?? recommendation?.category;
  const type = recommendation?.workout_type ?? types.find((item) => item.id === typeId);
  const archived = type?.archived || types.find((item) => item.id === typeId)?.archived;
  const active = archived && !recommendation?.split_name ? null : (recommendation ?? null);
  const isRestDay = active?.is_rest_day === true;
  const needsSplitUpdate =
    active?.needs_split_update === true || !!(active?.split_name && archived);
  const template = useMemo(() => {
    if (!active || isRestDay || needsSplitUpdate) return null;
    // A routine day with exercises wins; an empty one falls back to the type's saved exercises,
    // then to the last session of its type.
    if (active.routine_day?.movements.length)
      return routineSessionTemplate(active.routine_day, active.session_name, today, weightUnit);
    // Next, the exercises saved to the workout type itself.
    const saved = type ? savedExercises[type.id] : undefined;
    if (type && saved?.length)
      return typeSessionTemplate(type, saved, active.session_name, today, weightUnit);
    return sessionTemplateFor(
      workouts,
      active.category,
      today,
      weightUnit,
      type?.is_custom ? type.id : null,
    );
  }, [active, today, workouts, weightUnit, isRestDay, needsSplitUpdate, type, savedExercises]);
  const label = active
    ? isRestDay
      ? 'Rest'
      : (type?.name ?? (active.category === 'cardio' ? 'Cardio' : CATEGORY_LABELS[active.category]))
    : null;
  return { recommendation: active, label, template, type, isRestDay, needsSplitUpdate };
}
