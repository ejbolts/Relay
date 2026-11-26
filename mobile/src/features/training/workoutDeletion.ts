import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { readFinishedWorkouts } from '../../../../frontend/src/finishedWorkoutQueue';
import type { DashboardData, HeatmapDay, TrackedWorkout } from '../../../../frontend/src/types';
import {
  heatmapWithoutWorkouts,
  queuedWorkoutIds,
  WORKOUT_SYNCING_MESSAGE,
  workoutBlockedWhileSyncing,
} from '../../../../frontend/src/workoutDeletion';
import { apiSend } from '../../data/api';
import { deviceStorage } from '../../data/deviceStorage';
import {
  cachedExerciseByName,
  deletedWorkoutsKey,
  refreshTraining,
  useDeletedWorkouts,
} from '../../data/queries';
import { useOptionalSession } from '../../session/SessionProvider';
import { haptics } from '../../ui/haptics';
import { pendingActions, usePendingActions } from '../../ui/pendingActions';
import { isToastAccountCurrent, showToast, toastAccount } from '../../ui/Toast';
import { useWorkout } from '../workout/WorkoutProvider';

/** The `pendingActions` kind of a saved workout deleted while its Undo still shows. */
export const WORKOUT_DELETION = 'workout';

/** Saved workouts deleted in this session whose Undo still shows. */
export const usePendingWorkoutDeletions = () => usePendingActions(WORKOUT_DELETION);

/** Marks a workout deleted (every read leaves it out) or brings it back. */
function markDeleted(client: QueryClient, id: string, deleted: boolean) {
  client.setQueryData<readonly string[]>(deletedWorkoutsKey, (ids = []) =>
    deleted ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((item) => item !== id),
  );
}

/**
 * Takes a workout the server has deleted out of every cached list, calendar and dashboard, so
 * it stays gone once its deleted mark is cleared, even if the refresh after it fails.
 */
export function dropDeletedWorkout(client: QueryClient, id: string) {
  const lookup = cachedExerciseByName(client);
  const without = (data: unknown): unknown => {
    if (!data || typeof data !== 'object') return data;
    const record = data as Record<string, unknown>;
    // An infinite query's pages (Training's older months).
    if (Array.isArray(record.pages)) return { ...record, pages: record.pages.map(without) };
    const next = { ...record };
    for (const key of ['workouts', 'recent_workouts'] as const)
      if (Array.isArray(record[key]))
        next[key] = (record[key] as { id?: string }[]).filter((item) => item?.id !== id);
    if (Array.isArray(record.heatmap))
      next.heatmap = heatmapWithoutWorkouts(record.heatmap as HeatmapDay[], [id], lookup);
    return next;
  };
  for (const [queryKey, data] of [
    ...client.getQueriesData<DashboardData>({ queryKey: ['dashboard'] }),
    ...client.getQueriesData({ queryKey: ['workouts'] }),
  ]) {
    // A workout's own detail stays, so a screen still showing it doesn't empty.
    if (queryKey[1] !== 'detail' && data !== undefined)
      client.setQueryData(queryKey, without(data));
  }
}

// "Workout deleted" toasts whose Undo is on screen, by session. A notice about another deletion
// (it failed, or a save got there first) waits until none shows: showing it would replace that
// toast, which sends its delete and spends an Undo the person never saw end.
let showing: { token: string; account: string }[] = [];
let held: { account: string; message: string; variant: 'error' | 'warning' }[] = [];

function undoShowing(account: string) {
  return showing.some((entry) => entry.account === account);
}

function notify(account: string, message: string, variant: 'error' | 'warning') {
  if (!isToastAccountCurrent(account)) return;
  if (undoShowing(account)) held.push({ account, message, variant });
  else showToast(message, undefined, { account, variant });
}

/** A "Workout deleted" toast has ended: show what waited for it, once no other Undo shows. */
function undoEnded(token: string) {
  showing = showing.filter((entry) => entry.token !== token);
  const account = toastAccount();
  // Another session's notices are dropped with it.
  held = held.filter((entry) => entry.account === account);
  if (undoShowing(account) || !held.length) return;
  // The latest says the most; several at once are counted rather than replacing each other.
  const latest = held.at(-1)!;
  const message =
    held.length > 1
      ? `${held.length} workouts were not deleted. ${latest.message}`
      : latest.message;
  held = [];
  showToast(message, undefined, { account, variant: latest.variant });
}

/** For tests. */
export function resetWorkoutDeletions() {
  showing = [];
  held = [];
}

/**
 * Deleting a saved workout as the web does: it goes at once, "Workout deleted" offers Undo, and
 * the delete is sent only when that toast ends (timed out, dismissed, replaced, or the app left).
 * Undo or a failed delete brings it back; a session change drops it without sending anything.
 */
export function useWorkoutDeletion() {
  const client = useQueryClient();
  const status = useOptionalSession()?.status;
  const userId = status?.kind === 'signed-in' ? status.user.id : null;
  const workout = useWorkout();
  // The logger as it is when the delete is finally sent, not when it was asked for.
  const live = useRef(workout);
  useEffect(() => {
    live.current = workout;
  }, [workout]);

  const request = useCallback(
    (item: TrackedWorkout): boolean => {
      // A workout with changes still waiting to sync can't change until they land, as on the web.
      const waitingToSync = () =>
        workoutBlockedWhileSyncing(
          item.id,
          queuedWorkoutIds(
            readFinishedWorkouts(deviceStorage).filter(
              (entry) => entry.pendingSave.userId === userId,
            ),
          ),
        );
      if (waitingToSync()) {
        haptics.warning();
        showToast(WORKOUT_SYNCING_MESSAGE, undefined, { variant: 'warning' });
        return false;
      }
      const account = toastAccount();
      const token = pendingActions.add(WORKOUT_DELETION, item.id, account);
      if (!token) return false;
      markDeleted(client, item.id, true);
      // Brings it back (Undo, a failure, a save that got there first) and releases the mark.
      const keep = () => {
        if (isToastAccountCurrent(account)) markDeleted(client, item.id, false);
        pendingActions.remove(token);
      };
      // Toasts of an ended session were dropped without ending here.
      showing = [
        ...showing.filter((entry) => isToastAccountCurrent(entry.account)),
        { token, account },
      ];
      haptics.success();
      showToast(
        'Workout deleted',
        {
          label: 'Undo',
          run: () => {
            keep();
            undoEnded(token);
          },
          onDismiss: () => {
            undoEnded(token);
            // Finished in the logger while the Undo showed: that save is still on its way, and
            // deleting now would race it. The newer save wins, as the web blocks changing a
            // workout until its save lands.
            if (waitingToSync()) {
              keep();
              notify(account, WORKOUT_SYNCING_MESSAGE, 'warning');
              return;
            }
            void apiSend<void>(`/api/workouts/${encodeURIComponent(item.id)}`, 'DELETE').then(
              () => {
                // A session that has ended keeps nothing of this; its cache is already gone.
                if (isToastAccountCurrent(account)) {
                  // Deleted for certain: out of the cache before its mark goes, so a refresh that
                  // fails can't show it again.
                  dropDeletedWorkout(client, item.id);
                  markDeleted(client, item.id, false);
                  // Resuming it in the logger ends too: there is nothing left to save it over.
                  if (live.current.live?.resumedWorkoutId === item.id) live.current.discard();
                }
                pendingActions.remove(token);
                if (isToastAccountCurrent(account)) void refreshTraining(client);
              },
              (reason: unknown) => {
                keep();
                // Back from the server's own copy, whatever else changed in the cache meanwhile.
                if (isToastAccountCurrent(account)) void refreshTraining(client);
                notify(
                  account,
                  reason instanceof Error && reason.message
                    ? reason.message
                    : 'Could not delete that workout.',
                  'error',
                );
              },
            );
          },
        },
        { account, duration: 'important' },
      );
      return true;
    },
    [client, userId],
  );
  return { request };
}

/**
 * Training's history without the workouts deleted while their Undo shows. Home's reads and
 * Training's recent weeks already leave them out (`useDashboard`, `useWorkoutHistory`); this
 * covers Training's older months too.
 */
export function useWithoutPendingDeletions<
  H extends { workouts: readonly TrackedWorkout[]; heatmap: readonly HeatmapDay[] },
>(history: H): H {
  const client = useQueryClient();
  const deleted = useDeletedWorkouts();
  const { workouts, heatmap } = history;
  const shown = useMemo(
    () =>
      deleted.length
        ? {
            workouts: workouts.filter((item) => !deleted.includes(item.id)),
            heatmap: heatmapWithoutWorkouts(heatmap, deleted, cachedExerciseByName(client)),
          }
        : null,
    [client, deleted, workouts, heatmap],
  );
  return shown ? { ...history, ...shown } : history;
}
