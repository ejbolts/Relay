import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { ExerciseEditChanges } from '../../../../frontend/src/exerciseEdit';
import type {
  Exercise,
  ExerciseLibrarySummary,
  ExerciseProgress,
  TrainingBlock,
  WeightMapping,
} from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { queryKeys, refreshTraining } from '../../data/queries';

/**
 * Exercise reads, under `workouts` so `refreshTraining` refreshes them after a workout is saved.
 * Trends and progress are read for the chosen training block; its dates are part of the key, so
 * editing the block reads them again.
 */
export const exerciseKeys = {
  library: (block: TrainingBlock | null) =>
    ['workouts', 'progress', 'library', ...blockScope(block)] as const,
  progress: (id: string, block: TrainingBlock | null) =>
    ['workouts', 'progress', id, ...blockScope(block)] as const,
  mapping: (id: string) => ['workouts', 'weight-mapping', id] as const,
};

const blockScope = (block: TrainingBlock | null) =>
  block ? [block.id, block.start_date, block.end_date ?? ''] : ['all'];

const scoped = (path: string, block: TrainingBlock | null) =>
  block ? `${path}?${new URLSearchParams({ block_id: block.id })}` : path;

/** Each strength exercise's sessions, latest estimate and recent trend, for the library. */
export function useScopedExerciseLibrary(block: TrainingBlock | null, enabled: boolean) {
  return useQuery({
    queryKey: exerciseKeys.library(block),
    queryFn: ({ signal }) =>
      apiGet<ExerciseLibrarySummary[]>(scoped('/api/progress', block), signal),
    enabled,
  });
}

export function useScopedExerciseProgress(
  id: string,
  block: TrainingBlock | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: exerciseKeys.progress(id, block),
    queryFn: ({ signal }) =>
      apiGet<ExerciseProgress>(scoped(`/api/progress/${encodeURIComponent(id)}`, block), signal),
    enabled,
  });
}

/** The exercise's saved machines and how their weights compare. */
export function useWeightMapping(id: string) {
  return useQuery({
    queryKey: exerciseKeys.mapping(id),
    queryFn: ({ signal }) =>
      apiGet<WeightMapping>(`/api/exercises/${encodeURIComponent(id)}/weight-mapping`, signal),
  });
}

/** After an exercise changes, read the catalogue and everything derived from history again. */
export async function refreshExercises(client: QueryClient) {
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.exercises }),
    client.invalidateQueries({ queryKey: queryKeys.savedExercises }),
    refreshTraining(client),
  ]);
}

/** Puts a changed exercise in the catalogue straight away, before it is read again. */
function changedExercise(client: QueryClient, exercise: Exercise) {
  client.setQueryData<Exercise[]>(queryKeys.exercises, (list) =>
    list?.map((item) => (item.id === exercise.id ? exercise : item)),
  );
  return exercise;
}

export async function updateExercise(
  client: QueryClient,
  id: string,
  changes: ExerciseEditChanges & { hidden?: boolean; extra_reps_enabled?: boolean },
) {
  const exercise = await apiSend<Exercise>(
    `/api/exercises/${encodeURIComponent(id)}`,
    'PATCH',
    changes,
  );
  changedExercise(client, exercise);
  void refreshExercises(client);
  return exercise;
}

/** Merges a custom exercise into another; the custom exercise is removed. */
export async function mergeExercise(client: QueryClient, sourceId: string, targetId: string) {
  const target = await apiSend<Exercise>(
    `/api/exercises/${encodeURIComponent(sourceId)}/merge`,
    'POST',
    { target_exercise_id: targetId },
  );
  client.setQueryData<Exercise[]>(queryKeys.exercises, (list) =>
    list
      ?.filter((item) => item.id !== sourceId)
      .map((item) => (item.id === target.id ? target : item)),
  );
  void refreshExercises(client);
  return target;
}

/** Saving machine weights rebuilds personal records in the reference machine's weights. */
export async function saveWeightMapping(client: QueryClient, id: string, mapping: WeightMapping) {
  const saved = await apiSend<WeightMapping>(
    `/api/exercises/${encodeURIComponent(id)}/weight-mapping`,
    'PUT',
    {
      enabled: mapping.enabled,
      reference_machine_id: mapping.reference_machine_id,
      machines: mapping.machines.map(({ id: machineId, machine_kg, reference_kg }) => ({
        id: machineId,
        machine_kg,
        reference_kg,
      })),
    },
  );
  client.setQueryData(exerciseKeys.mapping(id), saved);
  void refreshTraining(client);
  return saved;
}
