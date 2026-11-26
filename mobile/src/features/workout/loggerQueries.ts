import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { hasOlderHistory, initialHistoryStart } from '../../../../frontend/src/historyWindow';
import type {
  ExerciseHistoryBaseline,
  MachinePhoto,
  MachinePhotoUsage,
  MachineSetting,
  TrainingBlocks,
} from '../../../../frontend/src/types';
import { apiGet } from '../../data/api';
import { useDashboard } from '../../data/queries';

/** Each exercise's history before `before`, the start of the loaded window, by exercise id. */
export interface HistoryBaselines {
  before: string;
  byExercise: Map<string, ExerciseHistoryBaseline>;
}

/**
 * The logger's own reads. Baselines sit under `workouts`, so `refreshTraining` refreshes them
 * after a save; training blocks change only in Settings.
 */
export const loggerKeys = {
  baselines: (before: string) => ['workouts', 'baselines', before] as const,
  trainingBlocks: ['training-blocks'] as const,
  autoSave: ['workout-auto-save'] as const,
  machines: (exerciseId: string) => ['machine-photos', exerciseId] as const,
  /** Every saved machine, for the exercise picker; a prefix of each exercise's own list. */
  allMachines: ['machine-photos'] as const,
};

/**
 * History older than the loaded window, condensed by the server, as the web loads it: live PR
 * badges compare with it, and an exercise not done recently still gets its last session's sets.
 * Only read when the account has workouts before the window.
 */
export function useHistoryBaselines(): HistoryBaselines | null {
  const before = initialHistoryStart();
  const dashboard = useDashboard();
  const older = hasOlderHistory(before, dashboard.data?.history);
  const query = useQuery({
    queryKey: loggerKeys.baselines(before),
    enabled: older,
    queryFn: ({ signal }) =>
      apiGet<ExerciseHistoryBaseline[]>(
        `/api/exercise-history-baselines?before=${encodeURIComponent(before)}`,
        signal,
      ),
    staleTime: 5 * 60_000,
  });
  const data = older ? query.data : undefined;
  return useMemo(
    () =>
      data
        ? {
            before,
            byExercise: new Map(data.map((baseline) => [baseline.exercise_id, baseline])),
          }
        : null,
    [before, data],
  );
}

/** Training blocks and fresh starts, which scope "Block PR" and "Fresh start PR" badges. */
export function useTrainingBlocks() {
  return useQuery({
    queryKey: loggerKeys.trainingBlocks,
    queryFn: ({ signal }) => apiGet<TrainingBlocks>('/api/training-blocks', signal),
    staleTime: 5 * 60_000,
  });
}

/** How long an unfinished workout runs before it counts as left running; null keeps 3 hours. */
export function useWorkoutAutoSave() {
  return useQuery({
    queryKey: loggerKeys.autoSave,
    queryFn: ({ signal }) =>
      apiGet<{ after_minutes: number | null }>('/api/workout-auto-save', signal),
    staleTime: 5 * 60_000,
  });
}

/** An exercise's saved machines, with how often and how recently workouts pinned them. */
export function useMachinePhotos(exerciseId: string, enabled = true) {
  return useQuery({
    queryKey: loggerKeys.machines(exerciseId),
    enabled,
    queryFn: ({ signal }) =>
      apiGet<MachinePhotoUsage[]>(
        `/api/exercises/${encodeURIComponent(exerciseId)}/machine-photos`,
        signal,
      ),
    staleTime: 5 * 60_000,
  });
}

/** Every saved machine on the account, most recently used first, for the exercise picker. */
export function useAllMachinePhotos(enabled = true) {
  return useQuery({
    queryKey: loggerKeys.allMachines,
    enabled,
    queryFn: ({ signal }) => apiGet<MachinePhotoUsage[]>('/api/machine-photos', signal),
    staleTime: 5 * 60_000,
  });
}

/** The machines the exercise's last session pinned, which a new movement starts with. */
export function lastUsedMachines(exerciseId: string) {
  return apiGet<MachinePhoto[]>(
    `/api/exercises/${encodeURIComponent(exerciseId)}/machine-photos/last-used`,
  );
}

/** A machine's saved settings, which its movement records when the machine is chosen. */
export function machineSettings(exerciseId: string, machinePhotoId: string) {
  return apiGet<{ settings: MachineSetting[] }>(
    `/api/exercises/${encodeURIComponent(exerciseId)}/machine-settings?machine_photo_id=${encodeURIComponent(machinePhotoId)}`,
  );
}
