import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { initialHistoryStart } from '../../../frontend/src/historyWindow';
import type {
  DashboardData,
  Exercise,
  PersonalRecord,
  RoutineMovement,
  TrainingPreferences,
  WorkoutSnapshot,
  WorkoutType,
  WorkoutTypeExercises,
} from '../../../frontend/src/types';
import { upNextSession } from '../../../frontend/src/upNextSession';
import { localDate } from '../../../frontend/src/utils';
import type { WeightUnit } from '../../../frontend/src/weightUnits';
import { heatmapWithoutWorkouts, type ExerciseByName } from '../../../frontend/src/workoutDeletion';
import { DEFAULT_WORKOUT_TYPES } from '../../../frontend/src/workoutTypes';
import { apiGet } from './api';

/**
 * The account data most screens share, read from the same endpoints the web app uses. Feature
 * screens add their own queries next to them; keep keys under these prefixes so a saved workout
 * refreshes everything that depends on it (see `refreshTraining`).
 */
export const queryKeys = {
  dashboard: (today: string) => ['dashboard', today] as const,
  workouts: (start: string) => ['workouts', start] as const,
  workoutTypes: ['workout-types'] as const,
  savedExercises: ['workout-type-exercises'] as const,
  exercises: ['exercises'] as const,
  trainingPreferences: ['training-preferences'] as const,
  personalRecords: ['personal-records'] as const,
};

/**
 * Saved workouts deleted while their Undo still shows (features/training/workoutDeletion), by id.
 * They stay in the cache (the delete isn't sent yet), so every read below leaves them out, and a
 * refresh meanwhile can't bring one back. Kept in the query cache, which every sign-in and
 * sign-out clears, so a list never outlives its session.
 */
export const deletedWorkoutsKey = ['deleted-workouts'] as const;
const NO_IDS: readonly string[] = [];

export function useDeletedWorkouts(): readonly string[] {
  const client = useQueryClient();
  return useQuery({
    queryKey: deletedWorkoutsKey,
    // Nothing to fetch: a refetch keeps the list as it is.
    queryFn: () => client.getQueryData<readonly string[]>(deletedWorkoutsKey) ?? NO_IDS,
    initialData: NO_IDS,
    staleTime: Infinity,
  }).data;
}

/** Exercises by name from the cached library, so a calendar day is rebuilt as the server does. */
export function cachedExerciseByName(client: QueryClient): ExerciseByName {
  const byName = new Map(
    (client.getQueryData<Exercise[]>(queryKeys.exercises) ?? []).map((item) => [item.name, item]),
  );
  return (name) => byName.get(name);
}

export function useDashboard() {
  const today = localDate();
  const client = useQueryClient();
  const deleted = useDeletedWorkouts();
  const select = useCallback(
    (data: DashboardData): DashboardData =>
      data && deleted.length
        ? {
            ...data,
            heatmap: heatmapWithoutWorkouts(
              data.heatmap ?? [],
              deleted,
              cachedExerciseByName(client),
            ),
            recent_workouts: (data.recent_workouts ?? []).filter(
              (item) => !deleted.includes(item.id),
            ),
          }
        : data,
    [client, deleted],
  );
  return useQuery({
    queryKey: queryKeys.dashboard(today),
    queryFn: ({ signal }) => apiGet<DashboardData>(`/api/dashboard?on_date=${today}`, signal),
    select,
  });
}

/** The history window the web opens with (frontend/src/historyWindow.ts), newest first. */
export function useWorkoutHistory() {
  const start = initialHistoryStart();
  const deleted = useDeletedWorkouts();
  return useQuery({
    queryKey: queryKeys.workouts(start),
    queryFn: ({ signal }) =>
      apiGet<WorkoutSnapshot>(`/api/workouts/snapshot?start=${start}`, signal),
    select: useCallback(
      (snapshot: WorkoutSnapshot) =>
        deleted.length
          ? snapshot.workouts.filter((item) => !deleted.includes(item.id))
          : snapshot.workouts,
      [deleted],
    ),
  });
}

export function useWorkoutTypes() {
  return useQuery({
    queryKey: queryKeys.workoutTypes,
    queryFn: ({ signal }) => apiGet<WorkoutType[]>('/api/workout-types', signal),
    placeholderData: DEFAULT_WORKOUT_TYPES,
  });
}

/** Exercises saved to each workout type, keyed by type id as the web's provider keeps them. */
export function useSavedExercises() {
  return useQuery({
    queryKey: queryKeys.savedExercises,
    queryFn: ({ signal }) => apiGet<WorkoutTypeExercises[]>('/api/workout-type-exercises', signal),
    select: (saved): Record<string, RoutineMovement[]> =>
      Object.fromEntries(saved.map((item) => [item.workout_type_id, item.movements])),
  });
}

export function useExercises() {
  return useQuery({
    queryKey: queryKeys.exercises,
    queryFn: ({ signal }) => apiGet<Exercise[]>('/api/exercises', signal),
    staleTime: 5 * 60_000,
  });
}

export function useTrainingPreferences() {
  return useQuery({
    queryKey: queryKeys.trainingPreferences,
    queryFn: ({ signal }) => apiGet<TrainingPreferences>('/api/training-preferences', signal),
  });
}

export function useWeightUnit(): WeightUnit {
  return useTrainingPreferences().data?.preferred_weight_unit ?? 'kg';
}

export function usePersonalRecords() {
  return useQuery({
    queryKey: queryKeys.personalRecords,
    queryFn: ({ signal }) =>
      apiGet<PersonalRecord[]>(
        '/api/personal-records?include_blocks=true&include_fresh_start=true',
        signal,
      ),
  });
}

/** Up next exactly as Home shows it on the web: the shared `upNextSession` rule. */
export function useUpNext() {
  const today = localDate();
  const dashboard = useDashboard();
  const workouts = useWorkoutHistory();
  const types = useWorkoutTypes();
  const saved = useSavedExercises();
  const weightUnit = useWeightUnit();
  const session = useMemo(
    () =>
      upNextSession({
        recommendation: dashboard.data?.recommendation,
        workouts: workouts.data ?? [],
        types: types.data ?? DEFAULT_WORKOUT_TYPES,
        savedExercises: saved.data ?? {},
        today,
        weightUnit,
      }),
    [dashboard.data, workouts.data, types.data, saved.data, today, weightUnit],
  );
  return {
    ...session,
    loading: dashboard.isPending || workouts.isPending,
    error: dashboard.error ?? workouts.error,
  };
}

/**
 * After a workout is saved or deleted, refresh everything derived from training history,
 * including saved machines' last use and counts (`['machine-photos']`), which choose the
 * last-used machine and order the machine filter.
 */
export function refreshTraining(client: QueryClient) {
  return Promise.all(
    [['dashboard'], ['workouts'], queryKeys.personalRecords, ['machine-photos']].map((queryKey) =>
      client.invalidateQueries({ queryKey }),
    ),
  );
}
