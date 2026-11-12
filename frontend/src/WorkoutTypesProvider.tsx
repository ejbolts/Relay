import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import type { RoutineMovement, WorkoutType } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';
import { WorkoutTypesContext } from './workoutTypesContext';

export function WorkoutTypesProvider({ children }: { children: ReactNode }) {
  const [types, setTypes] = useState<WorkoutType[]>(DEFAULT_WORKOUT_TYPES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedExercises, setSavedExercises] = useState<Record<string, RoutineMovement[]>>({});
  const requestVersion = useRef(0);
  const exercisesVersion = useRef(0);
  const reloadExercises = useCallback(async () => {
    const version = ++exercisesVersion.current;
    try {
      const saved = await api.getWorkoutTypeExercises();
      if (version === exercisesVersion.current)
        setSavedExercises(
          Object.fromEntries(saved.map((item) => [item.workout_type_id, item.movements])),
        );
    } catch {
      // Saved exercises only pre-fill workouts; without them a workout starts empty.
    }
  }, []);
  const applySavedExercises = useCallback((typeId: string, movements: RoutineMovement[]) => {
    ++exercisesVersion.current;
    setSavedExercises((current) => {
      const next = { ...current };
      if (movements.length) next[typeId] = movements;
      else delete next[typeId];
      return next;
    });
  }, []);
  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const saved = await api.getWorkoutTypes();
      if (version === requestVersion.current) setTypes(saved);
    } catch (reason) {
      if (version === requestVersion.current)
        setError(reason instanceof Error ? reason.message : 'Could not load workout types.');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);
  const applySaved = useCallback((saved: WorkoutType[]) => {
    ++requestVersion.current;
    setTypes(saved);
    setLoading(false);
    setError(null);
  }, []);
  useEffect(() => {
    void reload();
    void reloadExercises();
    return () => {
      // Invalidate pending requests on unmount; these refs are generation counters, not DOM refs.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++requestVersion.current;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++exercisesVersion.current;
    };
  }, [reload, reloadExercises]);
  const value = useMemo(
    () => ({ types, loading, error, reload, applySaved, savedExercises, applySavedExercises }),
    [types, loading, error, reload, applySaved, savedExercises, applySavedExercises],
  );
  return <WorkoutTypesContext.Provider value={value}>{children}</WorkoutTypesContext.Provider>;
}
