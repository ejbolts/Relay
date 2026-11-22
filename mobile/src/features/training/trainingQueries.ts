import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  appendOlderWorkouts,
  hasOlderHistory,
  initialHistoryStart,
  olderHistoryWindow,
  prependOlderDays,
} from '../../../../frontend/src/historyWindow';
import type {
  BodyMeasurement,
  CardioOverview,
  ExerciseLibrarySummary,
  ExerciseProgress,
  HeatmapDay,
  TrackedWorkout,
  WorkoutSnapshot,
} from '../../../../frontend/src/types';
import { apiGet } from '../../data/api';
import { useDashboard, useWorkoutHistory } from '../../data/queries';

/**
 * Training's own reads. Every key sits under `workouts`, so `refreshTraining` refreshes them
 * all after a workout is saved.
 */
export const trainingKeys = {
  older: (start: string) => ['workouts', 'older', start] as const,
  workout: (id: string) => ['workouts', 'detail', id] as const,
  library: ['workouts', 'progress'] as const,
  progress: (id: string) => ['workouts', 'progress', id] as const,
  cardio: ['workouts', 'cardio'] as const,
  measurements: ['workouts', 'body-measurements'] as const,
};

type OlderPage = {
  start: string;
  workouts: TrackedWorkout[];
  heatmap: HeatmapDay[];
};

/** Workouts and calendar days for a window older than the one loaded at startup. */
async function olderPage(start: string, signal: AbortSignal): Promise<OlderPage> {
  const window = olderHistoryWindow(start);
  const query = `start=${window.start}&end=${window.end}`;
  const [snapshot, heatmap] = await Promise.all([
    apiGet<WorkoutSnapshot>(`/api/workouts/snapshot?${query}`, signal),
    apiGet<HeatmapDay[]>(`/api/calendar?${query}`, signal),
  ]);
  return { start: window.start, workouts: snapshot.workouts, heatmap };
}

/**
 * The training log as the web's Training tab holds it: the recent window first, then older
 * months, six at a time, read only when the calendar or the session list reaches them
 * (frontend/src/historyWindow.ts).
 */
export function useTrainingHistory() {
  const initialStart = initialHistoryStart();
  const recent = useWorkoutHistory();
  const dashboard = useDashboard();
  const summary = dashboard.data?.history ?? null;
  const [requested, setRequested] = useState(false);
  const older = useInfiniteQuery({
    queryKey: trainingKeys.older(initialStart),
    enabled: requested,
    initialPageParam: initialStart,
    queryFn: ({ pageParam, signal }) => olderPage(pageParam, signal),
    getNextPageParam: (last) => (hasOlderHistory(last.start, summary) ? last.start : undefined),
  });
  const pages = older.data?.pages;
  const historyStart = pages?.at(-1)?.start ?? initialStart;
  const workouts = useMemo(
    () =>
      (pages ?? []).reduce(
        (loaded, page) => appendOlderWorkouts(loaded, page.workouts),
        recent.data ?? [],
      ),
    [pages, recent.data],
  );
  const heatmap = useMemo(
    () =>
      (pages ?? []).reduce(
        (loaded, page) => prependOlderDays(loaded, page.heatmap),
        dashboard.data?.heatmap ?? [],
      ),
    [pages, dashboard.data?.heatmap],
  );
  const hasOlder = hasOlderHistory(historyStart, summary);
  const loadingOlder = older.isFetching;
  const { fetchNextPage } = older;
  const loadOlder = () => {
    if (!hasOlder || loadingOlder) return;
    if (!requested) setRequested(true);
    else void fetchNextPage();
  };
  return {
    workouts,
    heatmap,
    summary,
    historyStart,
    hasOlder,
    loadingOlder,
    olderError: older.isError ? 'Could not load older workouts.' : null,
    retryOlder: () => void older.refetch(),
    loadOlder,
    loading: recent.isPending || dashboard.isPending,
    error: recent.error ?? dashboard.error,
    refreshing: recent.isRefetching || dashboard.isRefetching,
    refresh: () => Promise.all([recent.refetch(), dashboard.refetch(), older.refetch()]),
  };
}

/** One saved workout, for a session opened from a calendar day or an exercise. */
export function useSavedWorkout(id: string) {
  return useQuery({
    queryKey: trainingKeys.workout(id),
    queryFn: ({ signal }) => apiGet<TrackedWorkout>(`/api/workouts/${id}`, signal),
  });
}

/** Each strength exercise's sessions, latest estimate and recent trend, for the library. */
export function useExerciseLibrary() {
  return useQuery({
    queryKey: trainingKeys.library,
    queryFn: ({ signal }) => apiGet<ExerciseLibrarySummary[]>('/api/progress', signal),
  });
}

export function useExerciseProgress(id: string) {
  return useQuery({
    queryKey: trainingKeys.progress(id),
    queryFn: ({ signal }) => apiGet<ExerciseProgress>(`/api/progress/${id}`, signal),
  });
}

export function useCardioOverview() {
  return useQuery({
    queryKey: trainingKeys.cardio,
    queryFn: ({ signal }) => apiGet<CardioOverview>('/api/cardio', signal),
  });
}

/** Body check-ins, for the bodyweight a set without its own was lifted at. */
export function useBodyMeasurements() {
  return useQuery({
    queryKey: trainingKeys.measurements,
    queryFn: ({ signal }) => apiGet<BodyMeasurement[]>('/api/body-measurements', signal),
    staleTime: 5 * 60_000,
  });
}
