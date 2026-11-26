import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { readFinishedWorkouts } from '../../../../frontend/src/finishedWorkoutQueue';
import type { HeatmapDay, TrackedWorkout } from '../../../../frontend/src/types';
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
  refreshTraining,
  setWorkoutDeleted,
  useDeletedWorkouts,
} from '../../data/queries';
import { useOptionalSession } from '../../session/SessionProvider';
import { haptics } from '../../ui/haptics';
import { pendingActions, usePendingActions } from '../../ui/pendingActions';
import { isToastAccountCurrent, showToast, toastAccount, toastShowing } from '../../ui/Toast';
import { justSavedWorkouts } from '../review/justSavedWorkouts';
import { useWorkout } from '../workout/WorkoutProvider';

/** The `pendingActions` kind of a saved workout deleted while its Undo still shows. */
export const WORKOUT_DELETION = 'workout';

/** Said when a workout was saved again during its Undo, so its delete wasn't sent. */
export const WORKOUT_KEPT_MESSAGE = 'Workout kept: it was saved again.';

/** Saved workouts deleted in this session whose Undo still shows. */
export const usePendingWorkoutDeletions = () => usePendingActions(WORKOUT_DELETION);

// "Workout deleted" toasts whose Undo is on screen, by session, and notices about other deletions
// (one failed, or a save got there first) waiting to be shown. A notice never replaces a toast
// that is showing: replacing a toast ends it, which commits whatever its Undo would have undone.
let showing: { token: string; account: string }[] = [];
let held: { account: string; message: string; variant: 'error' | 'warning' }[] = [];
let retry: ReturnType<typeof setTimeout> | null = null;
const RETRY_MS = 1000;

const undoShowing = (account: string) => showing.some((entry) => entry.account === account);

/** Shows the waiting notices once no toast is on screen (checked again each second until then). */
function flushHeld() {
  const account = toastAccount();
  // Another session's notices are dropped with it.
  held = held.filter((entry) => entry.account === account);
  if (!held.length || undoShowing(account)) return;
  if (toastShowing()) {
    retry ??= setTimeout(() => {
      retry = null;
      flushHeld();
    }, RETRY_MS);
    return;
  }
  // The latest says the most; several at once are counted rather than replacing each other.
  const latest = held.at(-1)!;
  const message =
    held.length > 1
      ? `${held.length} workouts were not deleted. ${latest.message}`
      : latest.message;
  held = [];
  showToast(message, undefined, { account, variant: latest.variant });
}

function notify(account: string, message: string, variant: 'error' | 'warning') {
  if (!isToastAccountCurrent(account)) return;
  held.push({ account, message, variant });
  flushHeld();
}

/** A "Workout deleted" toast has ended (Undo, timed out, dismissed or replaced). */
function undoEnded(token: string) {
  showing = showing.filter((entry) => entry.token !== token);
  flushHeld();
}

/**
 * After a confirmed delete the workout stays hidden only until the server's copies have replaced
 * the cached ones: every dashboard and workout list on screen has loaded since, and those not on
 * screen are marked to load again when they are. Then it is shown again if the server has it,
 * as after a backup restore that brings it back.
 */
function unhideOnceReloaded(client: QueryClient, id: string, account: string) {
  const deletedAt = Date.now();
  const cache = client.getQueryCache();
  const reloaded = () =>
    cache
      .findAll({
        predicate: (query) =>
          query.queryKey[0] === 'dashboard' ||
          (query.queryKey[0] === 'workouts' && query.queryKey[1] !== 'detail'),
      })
      .every((query) =>
        query.getObserversCount() > 0
          ? query.state.dataUpdatedAt >= deletedAt && !query.state.isInvalidated
          : query.state.isInvalidated || query.state.dataUpdatedAt >= deletedAt,
      );
  let unsubscribe: (() => void) | null = null;
  const check = () => {
    if (!isToastAccountCurrent(account)) {
      unsubscribe?.();
      return true;
    }
    if (!reloaded()) return false;
    unsubscribe?.();
    setWorkoutDeleted(id, false);
    return true;
  };
  return () => {
    if (!check()) unsubscribe = cache.subscribe(() => void check());
  };
}

/** For tests. */
export function resetWorkoutDeletions() {
  showing = [];
  held = [];
  if (retry) clearTimeout(retry);
  retry = null;
}

/**
 * Deleting a saved workout as the web does: it goes at once, "Workout deleted" offers Undo, and
 * the delete is sent only when that toast ends (timed out, dismissed, replaced, or the app left).
 * Undo, a failed delete or a save made meanwhile brings it back; a session change drops it without
 * sending anything.
 *
 * Nothing cached is rewritten: the workout is marked deleted (`setWorkoutDeleted`) and every read
 * leaves it out, during the Undo and, once the server confirms, until its copies have reloaded.
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
      // The saves the server had confirmed when the delete was asked for: a newer one for this
      // workout (a resumed workout finished during the Undo) keeps it.
      const savedBefore = justSavedWorkouts();
      const savedSince = () =>
        justSavedWorkouts().some((entry) => entry.id === item.id && !savedBefore.includes(entry));
      setWorkoutDeleted(item.id, true);
      // Brings it back (Undo, a failure, a save that got there first) and releases the mark.
      const keep = () => {
        if (isToastAccountCurrent(account)) setWorkoutDeleted(item.id, false);
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
            // Saved again during the Undo, whether that save has reached the server or is still
            // on its way: the newer save wins, so the two never race, and the person is told.
            if (savedSince() || waitingToSync()) {
              keep();
              notify(account, WORKOUT_KEPT_MESSAGE, 'warning');
              return;
            }
            void apiSend<void>(`/api/workouts/${encodeURIComponent(item.id)}`, 'DELETE').then(
              () => {
                // Deleted for certain: it stays marked until the server's copies have reloaded, so
                // a refresh that fails can't show it again. A session that has ended keeps nothing.
                if (isToastAccountCurrent(account)) {
                  // Resuming it in the logger ends too: there is nothing left to save it over.
                  if (live.current.live?.resumedWorkoutId === item.id) live.current.discard();
                }
                pendingActions.remove(token);
                if (isToastAccountCurrent(account)) {
                  const settle = unhideOnceReloaded(client, item.id, account);
                  void refreshTraining(client).then(settle, settle);
                }
              },
              (reason: unknown) => {
                keep();
                // Back from the server's own copy.
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
 * Training's history without the workouts deleted in this session. Home's reads and Training's
 * recent weeks already leave them out (`useDashboard`, `useWorkoutHistory`); this covers
 * Training's older months too.
 */
export function useWithoutPendingDeletions<
  H extends { workouts: readonly TrackedWorkout[]; heatmap: readonly HeatmapDay[] },
>(history: H): H {
  const client = useQueryClient();
  const deleted = useDeletedWorkouts();
  const { workouts, heatmap } = history;
  const shown = useMemo(
    () =>
      deleted.length &&
      (workouts.some((item) => deleted.includes(item.id)) ||
        heatmap.some((day) => day.workouts?.some((item) => deleted.includes(item.id))))
        ? {
            workouts: workouts.filter((item) => !deleted.includes(item.id)),
            heatmap: heatmapWithoutWorkouts(heatmap, deleted, cachedExerciseByName(client)),
          }
        : null,
    [client, deleted, workouts, heatmap],
  );
  return shown ? { ...history, ...shown } : history;
}
