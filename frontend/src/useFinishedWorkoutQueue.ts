import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { inactiveWorkoutFinishAt } from './activeWorkoutTimeout';
import { isClientOutdated } from './clientVersion';
import {
  addFinishedWorkout,
  FINISHED_WORKOUTS_CHANGE_EVENT,
  FINISHED_WORKOUTS_KEY,
  finishedWorkoutKey,
  keepFinishedWorkoutsFor,
  moveLegacyFinishedWorkout,
  readFinishedWorkouts,
  removeFinishedWorkout,
  type FinishedWorkout,
} from './finishedWorkoutQueue';
import type { TrackedWorkout, WorkoutInput } from './types';
import {
  ACTIVE_WORKOUT_DRAFT_KEY,
  clearActiveWorkoutDraft,
  isActiveWorkoutDraft,
  readActiveWorkoutDraft,
  writeActiveWorkoutDraft,
  type ActiveWorkoutDraft,
  type PendingWorkoutSave,
} from './workoutDraft';

export const WORKOUT_SAVE_TIMEOUT_MS = 20_000;
export const OUTDATED_CLIENT_MESSAGE = 'Saved on this device. Update Relay to sync it.';

export interface SavedFromQueue {
  /** The finished workout as it was stored on this device. */
  finished: FinishedWorkout;
  /** Finished workouts still waiting to send after this one. */
  remaining: number;
}

function ownedBy(userId: string | null) {
  return (items: FinishedWorkout[]) => items.filter((item) => item.pendingSave.userId === userId);
}

/**
 * Finished workouts wait on this device and are sent one at a time, oldest first, until the
 * server confirms each. A workout the server refuses is held for review without blocking the
 * others; connection failures retry with backoff. New workouts can start meanwhile.
 */
export function useFinishedWorkoutQueue(
  userId: string | null,
  onSaved: (workout: TrackedWorkout, resumedId: string | null, saved: SavedFromQueue) => void,
) {
  // Reading also lists a finished workout an older release left in the draft; it moves on mount.
  const [items, setItems] = useState<FinishedWorkout[]>(() =>
    ownedBy(userId)(readFinishedWorkouts()),
  );
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  // Refused saves, by key, with the server's reason. Kept in a ref as well so the send loop sees
  // a refusal before the next render.
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const refusalsRef = useRef(refusals);
  const [outdated, setOutdated] = useState(false);
  const outdatedRef = useRef(false);
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;
  const wakeRef = useRef<() => void>(() => undefined);

  const reload = useCallback(() => {
    setItems((current) => {
      const next = ownedBy(userId)(readFinishedWorkouts());
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [userId]);

  const setRefusal = useCallback((key: string, message: string | null) => {
    const next = { ...refusalsRef.current };
    if (message === null) delete next[key];
    else next[key] = message;
    refusalsRef.current = next;
    setRefusals(next);
  }, []);

  useEffect(() => {
    let stopped = false;
    let running = false;
    let controller: AbortController | null = null;
    let retryTimer: number | undefined;
    let failures = 0;
    // Acknowledged in this run; never resent even if storage could not drop them.
    const sent = new Set<string>();
    const waiting = () =>
      ownedBy(userId)(readFinishedWorkouts()).filter((item) => {
        const key = finishedWorkoutKey(item);
        return !(key in refusalsRef.current) && !sent.has(key);
      });
    const stillQueued = (key: string) =>
      readFinishedWorkouts().some((item) => finishedWorkoutKey(item) === key);

    async function drain() {
      if (running) return;
      running = true;
      try {
        while (!stopped && !outdatedRef.current && navigator.onLine) {
          const next = waiting()[0];
          if (!next) return;
          const key = finishedWorkoutKey(next);
          const { payload, workoutId } = next.pendingSave;
          window.clearTimeout(retryTimer);
          controller = new AbortController();
          const requestController = controller;
          const timeout = window.setTimeout(
            () => requestController.abort(),
            WORKOUT_SAVE_TIMEOUT_MS,
          );
          setSendingKey(key);
          try {
            const workout = workoutId
              ? await api.updateWorkout(workoutId, payload, requestController.signal)
              : await api.createWorkout(payload, requestController.signal);
            if (stopped) return;
            failures = 0;
            sent.add(key);
            // Another tab may have discarded it, or already sent and acknowledged it.
            const acknowledge = stillQueued(key);
            removeFinishedWorkout(key);
            reload();
            if (acknowledge)
              savedCallback.current(workout, workoutId, {
                finished: next,
                remaining: waiting().length,
              });
          } catch (reason) {
            if (stopped) return;
            if (!stillQueued(key)) {
              reload();
              continue;
            }
            if (reason instanceof ApiError && isClientOutdated(reason.status, reason.code)) {
              // Every waiting workout stays on this device; the updated app sends them.
              outdatedRef.current = true;
              setOutdated(true);
              return;
            }
            // Validation and permission failures need a deliberate review, not endless replay.
            if (
              reason instanceof ApiError &&
              reason.status >= 400 &&
              reason.status < 500 &&
              ![408, 429].includes(reason.status)
            ) {
              setRefusal(key, reason.message);
              continue;
            }
            retryTimer = window.setTimeout(
              () => void drain(),
              Math.min(60_000, 5000 * 2 ** failures++),
            );
            return;
          } finally {
            window.clearTimeout(timeout);
            controller = null;
            if (!stopped) setSendingKey(null);
          }
        }
      } finally {
        running = false;
      }
    }

    const wake = () => {
      window.clearTimeout(retryTimer);
      void drain();
    };
    wakeRef.current = () => {
      failures = 0;
      wake();
    };
    const storageChanged = (event: StorageEvent) => {
      if (
        event.key !== FINISHED_WORKOUTS_KEY &&
        event.key !== ACTIVE_WORKOUT_DRAFT_KEY &&
        event.key !== null
      )
        return;
      // An older release in another tab may still finish into the active draft.
      moveLegacyFinishedWorkout();
      reload();
      wake();
    };
    // Storage changes wait for mount: other components may be listening for them.
    moveLegacyFinishedWorkout();
    // Another account's finished workouts never send from this one.
    keepFinishedWorkoutsFor(userId);
    reload();
    wake();
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    // Try before the page freezes as well as when it returns. An in-flight save is left alone;
    // eligible requests use keepalive, and every unconfirmed save remains in durable storage.
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pagehide', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('storage', storageChanged);
    window.addEventListener(FINISHED_WORKOUTS_CHANGE_EVENT, reload);
    return () => {
      stopped = true;
      controller?.abort();
      window.clearTimeout(retryTimer);
      wakeRef.current = () => undefined;
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pagehide', wake);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener(FINISHED_WORKOUTS_CHANGE_EVENT, reload);
    };
  }, [userId, reload, setRefusal]);

  /** Moves the finished active workout into the queue before any network request. */
  function queue(payload: WorkoutInput): PendingWorkoutSave {
    const draft = readActiveWorkoutDraft();
    if (
      !draft ||
      draft.pendingSave ||
      (!draft.resumingWorkoutId && draft.clientSessionId !== payload.client_session_id)
    )
      throw new Error(
        'Your workout could not be stored on this device. Keep it open and try again.',
      );
    const completion: PendingWorkoutSave = {
      userId,
      finishedAt: Date.now(),
      workoutId: draft.resumingWorkoutId ?? null,
      payload,
    };
    const finished = { ...draft, pendingSave: completion };
    // An entry the queue would not read back must never replace the open workout.
    if (!isActiveWorkoutDraft(finished) || !addFinishedWorkout(finished)) {
      throw new Error(
        'Your workout could not be stored on this device. Keep it open and free some storage before trying again.',
      );
    }
    clearActiveWorkoutDraft();
    reload();
    wakeRef.current();
    return completion;
  }

  /** Reopens a refused workout in the logger. Needs the active workout slot to be free. */
  function review(key: string): ActiveWorkoutDraft | null {
    const finished = readFinishedWorkouts().find((item) => finishedWorkoutKey(item) === key);
    if (!finished || !(key in refusalsRef.current) || readActiveWorkoutDraft()) return null;
    const { pendingSave, ...draft } = finished;
    const now = Date.now();
    const restored: ActiveWorkoutDraft = {
      ...draft,
      durationOverrideMinutes: pendingSave.payload.duration_minutes,
      lastActiveAt: now,
      inactiveFinishAt: inactiveWorkoutFinishAt(draft.startedAt, now),
    };
    if (!writeActiveWorkoutDraft(restored)) {
      setRefusal(
        key,
        'Could not open the workout for review. Free some device storage and try again.',
      );
      return null;
    }
    removeFinishedWorkout(key);
    setRefusal(key, null);
    reload();
    return restored;
  }

  /** Drops a finished workout that has not synced, such as one saved by mistake. */
  function discard(key: string): boolean {
    if (sendingKey === key) return false;
    if (!readFinishedWorkouts().some((item) => finishedWorkoutKey(item) === key)) return false;
    removeFinishedWorkout(key);
    setRefusal(key, null);
    reload();
    return true;
  }

  function retry() {
    outdatedRef.current = false;
    setOutdated(false);
    wakeRef.current();
  }

  return {
    items,
    sendingKey,
    saving: sendingKey !== null,
    refusals,
    outdated,
    queue,
    review,
    discard,
    retry,
  };
}
