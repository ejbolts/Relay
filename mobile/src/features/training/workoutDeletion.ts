import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
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
import { refreshTraining } from '../../data/queries';
import { useOptionalSession } from '../../session/SessionProvider';
import { haptics } from '../../ui/haptics';
import { pendingActions, usePendingActions } from '../../ui/pendingActions';
import { isToastAccountCurrent, showToast, toastAccount } from '../../ui/Toast';
import { useWorkout } from '../workout/WorkoutProvider';

/** The `pendingActions` kind of a saved workout deleted while its Undo still shows. */
export const WORKOUT_DELETION = 'workout';

/** Saved workouts deleted in this session whose Undo still shows: hidden everywhere. */
export const usePendingWorkoutDeletions = () => usePendingActions(WORKOUT_DELETION);

type Edited = { queryKey: QueryKey; before: unknown; after: unknown };

const withoutWorkout = <T extends { id: string }>(list: unknown, id: string) =>
  Array.isArray(list) ? (list as T[]).filter((item) => item.id !== id) : list;

/** A cached response with the workout taken out, or the same object when it isn't there. */
function dataWithout(data: unknown, id: string): unknown {
  if (!data || typeof data !== 'object') return data;
  const record = data as Record<string, unknown>;
  // An infinite query's pages (Training's older months).
  if (Array.isArray(record.pages)) {
    const pages = record.pages.map((page) => dataWithout(page, id));
    return pages.every((page, index) => page === (record.pages as unknown[])[index])
      ? data
      : { ...record, pages };
  }
  let next = record;
  for (const key of ['workouts', 'recent_workouts'] as const) {
    const list = record[key];
    if (Array.isArray(list) && list.some((item: { id?: string }) => item?.id === id))
      next = { ...next, [key]: withoutWorkout(list, id) };
  }
  if (Array.isArray(record.heatmap)) {
    const heatmap = heatmapWithoutWorkouts(record.heatmap as HeatmapDay[], [id]);
    if (
      heatmap.some((day, index) => day !== (record.heatmap as HeatmapDay[])[index]) ||
      heatmap.length !== record.heatmap.length
    )
      next = { ...next, heatmap };
  }
  return next;
}

/**
 * Takes the workout out of every cached list, calendar and dashboard at once (Home, Training and
 * their calendars read these), and returns how to put back what it changed.
 */
export function hideWorkoutInCache(client: QueryClient, id: string) {
  const edited: Edited[] = [];
  for (const [queryKey, before] of [
    ...client.getQueriesData<DashboardData>({ queryKey: ['dashboard'] }),
    ...client.getQueriesData({ queryKey: ['workouts'] }),
  ]) {
    // A workout's own detail stays, so a screen still showing it doesn't empty.
    if (queryKey[1] === 'detail') continue;
    const after = dataWithout(before, id);
    if (after === before) continue;
    client.setQueryData(queryKey, after);
    // What the cache holds now (it may keep a structurally shared copy), to recognise later.
    edited.push({ queryKey, before, after: client.getQueryData(queryKey) });
  }
  return {
    /** Puts back each response this changed, unless something newer has replaced it since. */
    restore() {
      for (const { queryKey, before, after } of edited)
        if (client.getQueryData(queryKey) === after) client.setQueryData(queryKey, before);
    },
  };
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
      const queued = queuedWorkoutIds(
        readFinishedWorkouts(deviceStorage).filter((entry) => entry.pendingSave.userId === userId),
      );
      if (workoutBlockedWhileSyncing(item.id, queued)) {
        haptics.warning();
        showToast(WORKOUT_SYNCING_MESSAGE, undefined, { variant: 'warning' });
        return false;
      }
      const account = toastAccount();
      const token = pendingActions.add(WORKOUT_DELETION, item.id, account);
      if (!token) return false;
      const hidden = hideWorkoutInCache(client, item.id);
      const done = () => pendingActions.remove(token);
      haptics.success();
      showToast(
        'Workout deleted',
        {
          label: 'Undo',
          run: () => {
            hidden.restore();
            done();
          },
          onDismiss: () =>
            void apiSend<void>(`/api/workouts/${encodeURIComponent(item.id)}`, 'DELETE').then(
              () => {
                // A session that has ended keeps nothing of this; its cache is already gone.
                if (isToastAccountCurrent(account)) {
                  // Deleted for certain: out of the cache before the pending mark goes, so a
                  // refresh that fails can't show it again.
                  hideWorkoutInCache(client, item.id);
                  // Resuming it in the logger ends too: there is nothing left to save it over.
                  if (live.current.live?.resumedWorkoutId === item.id) live.current.discard();
                }
                done();
                if (isToastAccountCurrent(account)) void refreshTraining(client);
              },
              (reason: unknown) => {
                if (isToastAccountCurrent(account)) hidden.restore();
                done();
                showToast(
                  reason instanceof Error && reason.message
                    ? reason.message
                    : 'Could not delete that workout.',
                  undefined,
                  { account, variant: 'error' },
                );
              },
            ),
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
 * Training's history without the workouts deleted while their Undo shows, so a refresh in the
 * meantime can't bring one back to the sessions or the calendar.
 */
export function useWithoutPendingDeletions<
  H extends { workouts: readonly TrackedWorkout[]; heatmap: readonly HeatmapDay[] },
>(history: H): H {
  // The hook returns a new list each render; this key changes only with its ids.
  const key = usePendingWorkoutDeletions().join(' ');
  const { workouts, heatmap } = history;
  const shown = useMemo(() => {
    const ids = key ? key.split(' ') : [];
    return ids.length
      ? {
          workouts: workouts.filter((item) => !ids.includes(item.id)),
          heatmap: heatmapWithoutWorkouts(heatmap, ids),
        }
      : null;
  }, [key, workouts, heatmap]);
  return shown ? { ...history, ...shown } : history;
}
