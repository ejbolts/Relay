import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { inactiveWorkoutFinishAt } from './activeWorkoutTimeout';
import type { TrackedWorkout, WorkoutInput } from './types';
import {
  ACTIVE_WORKOUT_DRAFT_KEY,
  clearActiveWorkoutDraft,
  readActiveWorkoutDraft,
  writeActiveWorkoutDraft,
  type PendingWorkoutSave,
} from './workoutDraft';

export const WORKOUT_SAVE_TIMEOUT_MS = 20_000;

/** One durable completion occupies the draft until acknowledged or explicitly reviewed. */
export function usePendingWorkoutSave(
  userId: string | null,
  onSaved: (workout: TrackedWorkout, resumedId: string | null) => void,
) {
  const [pending, setPending] = useState(() => {
    const stored = readActiveWorkoutDraft()?.pendingSave;
    if (stored && stored.userId !== userId) clearActiveWorkoutDraft();
    return stored?.userId === userId ? stored : null;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;

  function queue(payload: WorkoutInput) {
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
    if (!writeActiveWorkoutDraft({ ...draft, pendingSave: completion })) {
      throw new Error(
        'Your workout could not be stored on this device. Keep it open and free some storage before trying again.',
      );
    }
    setError(null);
    setNeedsReview(false);
    setPending(completion);
  }

  useEffect(() => {
    if (!pending || pending.userId !== userId) return;
    let stopped = false;
    let controller: AbortController | null = null;
    let retryTimer: number | undefined;
    let failures = 0;
    let rejected = false;
    const ownsSnapshot = () => {
      const stored = readActiveWorkoutDraft()?.pendingSave;
      return stored?.userId === userId && JSON.stringify(stored) === JSON.stringify(pending);
    };
    const forget = () => {
      stopped = true;
      controller?.abort();
      window.clearTimeout(retryTimer);
      setPending(null);
      setSaving(false);
    };
    async function send() {
      if (stopped || controller || rejected) return;
      if (!ownsSnapshot()) {
        forget();
        return;
      }
      if (!navigator.onLine) {
        setSaving(false);
        return;
      }
      window.clearTimeout(retryTimer);
      controller = new AbortController();
      const requestController = controller;
      const timeout = window.setTimeout(() => requestController.abort(), WORKOUT_SAVE_TIMEOUT_MS);
      setSaving(true);
      setError(null);
      try {
        const workout = pending!.workoutId
          ? await api.updateWorkout(pending!.workoutId, pending!.payload, requestController.signal)
          : await api.createWorkout(pending!.payload, requestController.signal);
        if (stopped || !ownsSnapshot()) return;
        clearActiveWorkoutDraft();
        setPending(null);
        savedCallback.current(workout, pending!.workoutId);
      } catch (reason) {
        if (stopped || !ownsSnapshot()) return;
        // Validation/permission failures need a deliberate review, not endless replay.
        rejected =
          reason instanceof ApiError &&
          reason.status >= 400 &&
          reason.status < 500 &&
          ![408, 429].includes(reason.status);
        setNeedsReview(rejected);
        setError(
          rejected && reason instanceof Error
            ? reason.message
            : 'Saved on this device. Waiting to sync.',
        );
        if (!rejected) {
          retryTimer = window.setTimeout(
            () => void send(),
            Math.min(60_000, 5000 * 2 ** failures++),
          );
        }
      } finally {
        window.clearTimeout(timeout);
        controller = null;
        if (!stopped) setSaving(false);
      }
    }
    const reconnect = () => {
      if (document.visibilityState !== 'hidden') void send();
    };
    const storageChanged = (event: StorageEvent) => {
      if ((event.key === ACTIVE_WORKOUT_DRAFT_KEY || event.key === null) && !ownsSnapshot())
        forget();
    };
    void send();
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', reconnect);
    document.addEventListener('visibilitychange', reconnect);
    window.addEventListener('storage', storageChanged);
    return () => {
      stopped = true;
      controller?.abort();
      window.clearTimeout(retryTimer);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', reconnect);
      document.removeEventListener('visibilitychange', reconnect);
      window.removeEventListener('storage', storageChanged);
    };
  }, [pending, userId, attempt]);

  function review() {
    const draft = readActiveWorkoutDraft();
    if (
      !needsReview ||
      !draft ||
      draft.pendingSave?.userId !== userId ||
      JSON.stringify(draft.pendingSave) !== JSON.stringify(pending)
    )
      return null;
    const restored = {
      ...draft,
      pendingSave: undefined,
      durationOverrideMinutes: draft.pendingSave.payload.duration_minutes,
      lastActiveAt: Date.now(),
      inactiveFinishAt: inactiveWorkoutFinishAt(draft.startedAt, Date.now()),
    };
    if (!writeActiveWorkoutDraft(restored)) {
      setError('Could not open the workout for review. Free some device storage and try again.');
      return null;
    }
    setPending(null);
    setError(null);
    setNeedsReview(false);
    return restored;
  }

  return {
    pending,
    saving,
    error,
    needsReview,
    queue,
    review,
    retry: () => setAttempt((value) => value + 1),
  };
}
