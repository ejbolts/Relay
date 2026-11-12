import { createContext, useContext } from 'react';
import type { RoutineMovement, WorkoutType } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';

export const WorkoutTypesContext = createContext<{
  types: WorkoutType[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  applySaved: (types: WorkoutType[]) => void;
  /** Exercises saved to each workout type, by type id. */
  savedExercises: Record<string, RoutineMovement[]>;
  applySavedExercises: (typeId: string, movements: RoutineMovement[]) => void;
}>({
  types: DEFAULT_WORKOUT_TYPES,
  loading: false,
  error: null,
  reload: async () => undefined,
  applySaved: () => undefined,
  savedExercises: {},
  applySavedExercises: () => undefined,
});

export const useWorkoutTypes = () => useContext(WorkoutTypesContext);
