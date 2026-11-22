import { useMemo } from 'react';
import { bodyweightOn } from '../../../../frontend/src/relativeStrength';
import { recordCountsByWorkout, weekStartDayOf } from '../../../../frontend/src/trainingSummary';
import type { TrackedWorkout, WorkoutType } from '../../../../frontend/src/types';
import {
  builtinTypeColors,
  DEFAULT_WORKOUT_TYPES,
  effectiveWorkoutType,
} from '../../../../frontend/src/workoutTypes';
import { workoutTypeColor } from '../../../../frontend/src/dayColors';
import {
  usePersonalRecords,
  useTrainingPreferences,
  useWeightUnit,
  useWorkoutTypes,
} from '../../data/queries';
import { useBodyMeasurements } from './trainingQueries';

/** The colour a session is drawn in: its workout type's. */
export function workoutColor(
  workout: Pick<TrackedWorkout, 'category' | 'workout_type_id' | 'workout_type'>,
  types: WorkoutType[],
) {
  return workoutTypeColor(effectiveWorkoutType(workout, types), builtinTypeColors(types));
}

/** What every Training screen reads alongside its own data. */
export function useTrainingContext() {
  const types = useWorkoutTypes().data ?? DEFAULT_WORKOUT_TYPES;
  const preferences = useTrainingPreferences().data;
  const unit = useWeightUnit();
  const records = usePersonalRecords();
  const measurements = useBodyMeasurements().data;
  const personalRecords = useMemo(() => records.data ?? [], [records.data]);
  const recordCounts = useMemo(() => recordCountsByWorkout(personalRecords), [personalRecords]);
  const categoryColors = useMemo(() => builtinTypeColors(types), [types]);
  return {
    types,
    categoryColors,
    unit,
    weekStartDay: weekStartDayOf(preferences?.week_start),
    personalRecords,
    recordCounts,
    bodyweightOn: (date: string) => bodyweightOn(measurements ?? [], date),
    colorOf: (workout: Pick<TrackedWorkout, 'category' | 'workout_type_id' | 'workout_type'>) =>
      workoutColor(workout, types),
  };
}
