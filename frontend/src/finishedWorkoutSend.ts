import { addFinishedWorkout } from './finishedWorkoutQueue';
import type { WorkoutInput } from './types';
import {
  clearActiveWorkoutDraft,
  isActiveWorkoutDraft,
  readActiveWorkoutDraft,
  type DraftStorage,
  type PendingWorkoutSave,
} from './workoutDraft';

// How a finished workout reaches the server exactly once: it moves from the active draft into
// the finished-workout queue before any request, and is resent until the server confirms it
// (the server recognises a repeat by its client_session_id). Plain functions with no React or
// browser APIs: the web's useFinishedWorkoutQueue and the native app (mobile/) both use them.
// `storage` is the device storage; left out, the browser's localStorage.

/**
 * Moves the finished active workout into the queue, before any network request, and frees the
 * active draft. Throws with a message for the person when it cannot be stored.
 */
export function moveDraftToFinishedQueue(
  payload: WorkoutInput,
  userId: string | null,
  finishedAt: number,
  storage?: DraftStorage | null,
): PendingWorkoutSave {
  const draft = readActiveWorkoutDraft(storage);
  if (
    !draft ||
    draft.pendingSave ||
    (!draft.resumingWorkoutId && draft.clientSessionId !== payload.client_session_id)
  )
    throw new Error('Your workout could not be stored on this device. Keep it open and try again.');
  const completion: PendingWorkoutSave = {
    userId,
    finishedAt,
    workoutId: draft.resumingWorkoutId ?? null,
    payload,
  };
  const finished = { ...draft, pendingSave: completion };
  // An entry the queue would not read back must never replace the open workout.
  if (!isActiveWorkoutDraft(finished) || !addFinishedWorkout(finished, storage)) {
    throw new Error(
      'Your workout could not be stored on this device. Keep it open and free some storage before trying again.',
    );
  }
  clearActiveWorkoutDraft(storage);
  return completion;
}

/**
 * What to do after a finished workout failed to send: wait for an app update, hold it for review
 * (validation and permission failures need a deliberate review, not endless replay), or retry.
 * `status` is the HTTP status, or undefined when the server was not reached.
 */
export function finishedSaveFailure(
  status: number | undefined,
  clientOutdated: boolean,
): 'outdated' | 'refused' | 'retry' {
  if (clientOutdated) return 'outdated';
  if (status !== undefined && status >= 400 && status < 500 && ![408, 429].includes(status))
    return 'refused';
  return 'retry';
}

/** The wait before the next attempt after `failures` failed connections in a row. */
export function finishedSaveRetryDelayMs(failures: number): number {
  return Math.min(60_000, 5000 * 2 ** failures);
}
