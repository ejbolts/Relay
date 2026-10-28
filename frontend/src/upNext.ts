import { useMemo } from 'react';
import { CATEGORY_LABELS, sessionTemplateFor } from './trainingSummary';
import { useWeightUnit } from './trainingPreferencesContext';
import type { TrackedWorkout, WorkoutRecommendation } from './types';
import { localDate } from './utils';
import { useWorkoutTypes } from './workoutTypesContext';

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
  const { types } = useWorkoutTypes();
  const typeId = recommendation?.workout_type?.id ?? recommendation?.category;
  const type = recommendation?.workout_type ?? types.find((item) => item.id === typeId);
  const archived = type?.archived || types.find((item) => item.id === typeId)?.archived;
  const active = archived && !recommendation?.split_name ? null : (recommendation ?? null);
  const isRestDay = active?.is_rest_day === true;
  const needsSplitUpdate =
    active?.needs_split_update === true || !!(active?.split_name && archived);
  const template = useMemo(
    () =>
      active && !isRestDay && !needsSplitUpdate
        ? sessionTemplateFor(
            workouts,
            active.category,
            today,
            weightUnit,
            type?.is_custom ? type.id : null,
          )
        : null,
    [active, today, workouts, weightUnit, isRestDay, needsSplitUpdate, type],
  );
  const label = active
    ? isRestDay
      ? 'Rest'
      : (type?.name ?? (active.category === 'cardio' ? 'Cardio' : CATEGORY_LABELS[active.category]))
    : null;
  return { recommendation: active, label, template, type, isRestDay, needsSplitUpdate };
}
