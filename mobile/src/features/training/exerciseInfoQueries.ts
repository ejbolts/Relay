import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { Exercise, LiftRanking } from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { queryKeys, refreshTraining } from '../../data/queries';

/**
 * Queries for exercise info (friends' lift ranking and partial-set updates), kept under
 * `workouts` so `refreshTraining` refreshes rankings after a workout is saved.
 */
export const exerciseInfoKeys = {
  liftLeaderboard: (exerciseId: string) => ['workouts', 'lift-leaderboard', exerciseId] as const,
};

/**
 * One of your lifts, ranked against the friends who have logged it. Friends are an extra here:
 * an account that shares with nobody (or is offline) simply sees no card.
 */
export function useLiftLeaderboard(exerciseId: string) {
  return useQuery({
    queryKey: exerciseInfoKeys.liftLeaderboard(exerciseId),
    queryFn: ({ signal }) =>
      apiGet<{ entries: LiftRanking[] }>(
        `/api/sharing/lifts/${encodeURIComponent(exerciseId)}`,
        signal,
      ),
    select: (data) => data.entries,
    retry: false,
  });
}

/** Saves whether partial sets count for an exercise from `weekStart` forward, and refreshes training. */
export async function updateExercisePartialSets(
  client: QueryClient,
  exerciseId: string,
  enabled: boolean,
  weekStart: string,
): Promise<Exercise> {
  const updated = await apiSend<Exercise>(
    `/api/exercises/${encodeURIComponent(exerciseId)}/partial-sets`,
    'PATCH',
    { partial_sets_enabled: enabled, week_start: weekStart },
  );
  client.setQueryData<Exercise[]>(queryKeys.exercises, (current) =>
    current?.map((item) => (item.id === updated.id ? updated : item)),
  );
  void Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.exercises }),
    refreshTraining(client),
  ]);
  return updated;
}
