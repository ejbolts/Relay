import { onlineManager, useQuery, type QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { Exercise, LiftRanking } from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { queryKeys, refreshTraining } from '../../data/queries';
import { isToastAccountCurrent, toastAccount } from '../../ui/Toast';
import { socialApi } from '../social/socialApi';
import { socialKeys } from '../social/socialQueries';

/**
 * Queries for exercise info (friends' lift ranking and partial-set updates), kept under
 * `workouts` so `refreshTraining` refreshes rankings after a workout is saved.
 */
export const exerciseInfoKeys = {
  liftLeaderboards: ['workouts', 'lift-leaderboard'] as const,
  liftLeaderboard: (exerciseId: string) => ['workouts', 'lift-leaderboard', exerciseId] as const,
};

function subscribeOnline(listener: () => void) {
  return onlineManager.subscribe(listener);
}

function isOnlineSnapshot() {
  return onlineManager.isOnline();
}

/** Whether React Query considers the device online (fed by NetInfo in data/queryClient.ts). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, isOnlineSnapshot, isOnlineSnapshot);
}

/**
 * Whether the account's saved sharing is Private. Observes the same sharing-choices query as
 * Settings (with its normal revalidation while online), so a value changed on another device
 * refreshes instead of hiding the ranking for good.
 */
export function useSharingPrivate(online: boolean): boolean {
  const choices = useQuery({
    queryKey: socialKeys.choices,
    queryFn: ({ signal }) => socialApi.choices(signal),
    enabled: online,
  });
  return choices.data?.visibility === 'private';
}

/** Removes cached leaderboards when sharing turns Private, or invalidates them otherwise. */
export function syncLiftLeaderboardsForSharing(client: QueryClient, visibility: string) {
  if (visibility === 'private') {
    client.removeQueries({ queryKey: exerciseInfoKeys.liftLeaderboards });
  } else {
    void client.invalidateQueries({ queryKey: exerciseInfoKeys.liftLeaderboards });
  }
}

/**
 * One of your lifts, ranked against the friends who have logged it. Friends are an extra here:
 * an account that shares with nobody (or is offline) simply sees no card.
 */
export function useLiftLeaderboard(exerciseId: string, enabled = true) {
  return useQuery({
    queryKey: exerciseInfoKeys.liftLeaderboard(exerciseId),
    queryFn: ({ signal }) =>
      apiGet<{ entries: LiftRanking[] }>(
        `/api/sharing/lifts/${encodeURIComponent(exerciseId)}`,
        signal,
      ),
    select: (data) => data.entries,
    enabled,
    retry: false,
  });
}

/**
 * Saves whether partial sets count for an exercise from `weekStart` forward, and refreshes
 * training only if the session that started the save is still current.
 */
export async function updateExercisePartialSets(
  client: QueryClient,
  exerciseId: string,
  enabled: boolean,
  weekStart: string,
  account = toastAccount(),
): Promise<Exercise | null> {
  const updated = await apiSend<Exercise>(
    `/api/exercises/${encodeURIComponent(exerciseId)}/partial-sets`,
    'PATCH',
    { partial_sets_enabled: enabled, week_start: weekStart },
  );
  if (!isToastAccountCurrent(account)) return null;
  client.setQueryData<Exercise[]>(queryKeys.exercises, (current) =>
    current?.map((item) => (item.id === updated.id ? updated : item)),
  );
  void Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.exercises }),
    refreshTraining(client),
  ]);
  return updated;
}
