import {
  replaceEqualDeep,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
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
import { sessionEpoch } from '../session/sessionEpoch';
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
 * Saved workouts deleted in this session (features/training/workoutDeletion), by id: those whose
 * Undo still shows, and those the server has since deleted. Every read below leaves them out, so
 * a refresh while the Undo shows can't bring one back, and a confirmed delete needs no rewrite of
 * any cached response. Kept outside the query cache, so resetting queries can't empty it, and tied
 * to the session number, so another session never reads it.
 */
let deleted: { epoch: number; ids: readonly string[] } = { epoch: -1, ids: [] };
const deletedListeners = new Set<() => void>();
const NO_IDS: readonly string[] = [];

/** Marks a workout deleted in the current session, or brings it back. */
export function setWorkoutDeleted(id: string, isDeleted: boolean) {
  const epoch = sessionEpoch();
  const ids = deleted.epoch === epoch ? deleted.ids : NO_IDS;
  const next = isDeleted
    ? ids.includes(id)
      ? ids
      : [...ids, id]
    : ids.filter((item) => item !== id);
  if (next === ids && deleted.epoch === epoch) return;
  deleted = { epoch, ids: next };
  deletedListeners.forEach((listener) => listener());
}

const deletedNow = () => (deleted.epoch === sessionEpoch() ? deleted.ids : NO_IDS);
const subscribeDeleted = (listener: () => void) => {
  deletedListeners.add(listener);
  return () => void deletedListeners.delete(listener);
};

export function useDeletedWorkouts(): readonly string[] {
  return useSyncExternalStore(subscribeDeleted, deletedNow);
}

/** Exercises by name from the cached library, so a calendar day is rebuilt as the server does. */
export function cachedExerciseByName(client: QueryClient): ExerciseByName {
  const byName = new Map(
    (client.getQueryData<Exercise[]>(queryKeys.exercises) ?? []).map((item) => [item.name, item]),
  );
  return (name) => byName.get(name);
}

// A dashboard shown without deleted workouts, mapped to the response it came from, so code that
// recognises a response by identity (the weekly review's just-saved workouts) still can.
const dashboardSources = new WeakMap<object, unknown>();

/** Structural sharing as usual, keeping a filtered dashboard's link to its response. */
function shareDashboard(previous: unknown, next: unknown): unknown {
  const shared = replaceEqualDeep(previous, next);
  const source = next && typeof next === 'object' ? dashboardSources.get(next) : undefined;
  if (source && shared && typeof shared === 'object') dashboardSources.set(shared, source);
  return shared;
}

/** The cached response a dashboard from `useDashboard` was read from. */
export function dashboardSource(dashboard: unknown): unknown {
  return (
    (dashboard && typeof dashboard === 'object' && dashboardSources.get(dashboard)) || dashboard
  );
}

export function useDashboard() {
  const today = localDate();
  const client = useQueryClient();
  const ids = useDeletedWorkouts();
  const select = useCallback(
    (data: DashboardData): DashboardData => {
      const holds = (list: readonly { id?: string }[] | undefined) =>
        Array.isArray(list) && list.some((item) => ids.includes(item?.id ?? ''));
      // Untouched (same object) unless it still holds a deleted workout.
      if (
        !data ||
        !ids.length ||
        (!holds(data.recent_workouts) &&
          !(Array.isArray(data.heatmap) && data.heatmap.some((day) => holds(day.workouts))))
      )
        return data;
      const shown = {
        ...data,
        heatmap: heatmapWithoutWorkouts(data.heatmap ?? [], ids, cachedExerciseByName(client)),
        recent_workouts: (data.recent_workouts ?? []).filter((item) => !ids.includes(item.id)),
      };
      dashboardSources.set(shown, data);
      return shown;
    },
    [client, ids],
  );
  return useQuery({
    queryKey: queryKeys.dashboard(today),
    queryFn: ({ signal }) => apiGet<DashboardData>(`/api/dashboard?on_date=${today}`, signal),
    select,
    structuralSharing: shareDashboard,
  });
}

/** The history window the web opens with (frontend/src/historyWindow.ts), newest first. */
export function useWorkoutHistory() {
  const start = initialHistoryStart();
  const ids = useDeletedWorkouts();
  return useQuery({
    queryKey: queryKeys.workouts(start),
    queryFn: ({ signal }) =>
      apiGet<WorkoutSnapshot>(`/api/workouts/snapshot?start=${start}`, signal),
    select: useCallback(
      (snapshot: WorkoutSnapshot) =>
        ids.length && snapshot.workouts.some((item) => ids.includes(item.id))
          ? snapshot.workouts.filter((item) => !ids.includes(item.id))
          : snapshot.workouts,
      [ids],
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
