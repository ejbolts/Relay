import { useMemo } from 'react';
import { useWeightUnit } from './trainingPreferencesContext';
import type { TrackedWorkout, WorkoutRecommendation } from './types';
import { upNextSession } from './upNextSession';
import { localDate } from './utils';
import { useWorkoutTypes } from './workoutTypesContext';

/**
 * The recommended next session shared by Home's Up next card and the Start menu, from this
 * account's workout types and units. The rule itself is `upNextSession`, which the native app
 * shares.
 */
export function useUpNextSession(
  recommendation: WorkoutRecommendation | null | undefined,
  workouts: TrackedWorkout[],
  today = localDate(),
) {
  const weightUnit = useWeightUnit();
  const { types, savedExercises } = useWorkoutTypes();
  return useMemo(
    () => upNextSession({ recommendation, workouts, types, savedExercises, today, weightUnit }),
    [recommendation, workouts, types, savedExercises, today, weightUnit],
  );
}
