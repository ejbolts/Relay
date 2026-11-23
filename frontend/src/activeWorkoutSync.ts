import { useEffect, useRef, useState } from 'react';
import { api, isConnectionFailure } from './api';
import {
  ACTIVE_WORKOUT_SYNC_KEY,
  REMOTE_WORKOUT_APPLIED,
  SHARED_WORKOUT_CHANGED,
} from './activeWorkoutEvents';
import { readFinishedWorkouts, FINISHED_WORKOUTS_CHANGE_EVENT } from './finishedWorkoutQueue';
import {
  ActiveWorkoutSynchronizer as SharedSynchronizer,
  draftSignature,
  type SharedWorkoutSnapshot,
  type SyncDependencies,
  type WorkoutSyncConflict,
  type WorkoutSyncStatus,
} from './activeWorkoutSynchronizer';
import type { WorkoutInput } from './types';
import { workoutAutoSaveMinutes } from './workoutAutoSaveChoice';
import {
  ACTIVE_WORKOUT_CHANGE_EVENT,
  ACTIVE_WORKOUT_DRAFT_KEY,
  clearActiveWorkoutDraft,
  isActiveWorkoutDraft,
  readActiveWorkoutDraft,
  writeActiveWorkoutDraft,
  type ActiveWorkoutDraft,
} from './workoutDraft';

export { draftSignature };
export type { SharedWorkoutSnapshot, WorkoutSyncConflict, WorkoutSyncStatus };

/** The shared synchronizer with this browser's connection check and session ids. */
export class ActiveWorkoutSynchronizer extends SharedSynchronizer {
  constructor(
    deps: Omit<SyncDependencies, 'connectionFailure' | 'newId'> &
      Partial<Pick<SyncDependencies, 'connectionFailure' | 'newId'>>,
    base: SharedWorkoutSnapshot | null = null,
  ) {
    super(
      { connectionFailure: isConnectionFailure, newId: () => crypto.randomUUID(), ...deps },
      base,
    );
  }
}

// The finished workout the logger would save at the current draft's cutoff, for auto-save.
// It travels only with that exact draft, so the server never saves a version it did not see.
let prepared: { signature: string; workout: WorkoutInput } | null = null;

export function prepareWorkoutAutoSave(
  draft: ActiveWorkoutDraft,
  workout: WorkoutInput | null,
): void {
  prepared = workout ? { signature: draftSignature(draft), workout } : null;
}

export function preparedWorkoutAutoSave(draft: ActiveWorkoutDraft | null): WorkoutInput | null {
  if (!draft || !prepared || workoutAutoSaveMinutes() === null) return null;
  return prepared.signature === draftSignature(draft) ? prepared.workout : null;
}

function withAutoSave<T extends { draft: ActiveWorkoutDraft | null }>(change: T) {
  const autoSave = preparedWorkoutAutoSave(change.draft);
  return autoSave ? { ...change, autoSave } : change;
}

let currentSync: ActiveWorkoutSynchronizer | null = null;
export async function sharedWorkoutFinishFields() {
  return currentSync ? currentSync.finishFields() : {};
}

export function useActiveWorkoutSync(userId: string | null) {
  const [state, setState] = useState<{
    status: WorkoutSyncStatus;
    conflict: WorkoutSyncConflict | null;
    error: string | null;
  }>({ status: 'syncing', conflict: null, error: null });
  const controller = useRef<ActiveWorkoutSynchronizer | null>(null);
  useEffect(() => {
    if (!userId) return;
    let applying = false;
    let timer: number | undefined;
    let savedBase: SharedWorkoutSnapshot | null = null;
    try {
      const saved = JSON.parse(localStorage.getItem(ACTIVE_WORKOUT_SYNC_KEY) ?? 'null');
      if (
        saved?.userId === userId &&
        Number.isInteger(saved.base?.revision) &&
        saved.base.revision >= 0 &&
        (saved.base.draft === null || isActiveWorkoutDraft(saved.base.draft))
      )
        savedBase = saved.base;
    } catch {
      /* A missing or invalid journal requires a fresh server read. */
    }
    const sync = new ActiveWorkoutSynchronizer(
      {
        read: api.activeWorkout,
        put: (change) => api.syncActiveWorkout(withAutoSave(change)),
        local: readActiveWorkoutDraft,
        queued: (sessionId) =>
          Boolean(
            sessionId &&
            readFinishedWorkouts().some(
              (item) => item.pendingSave.userId === userId && item.clientSessionId === sessionId,
            ),
          ),
        apply: (draft) => {
          if (draftSignature(draft) === draftSignature(readActiveWorkoutDraft())) return true;
          if (draft && !isActiveWorkoutDraft(draft))
            throw new Error('This workout needs a newer version of Relay.');
          applying = true;
          try {
            if (draft) {
              if (!writeActiveWorkoutDraft(draft)) return false;
            } else {
              clearActiveWorkoutDraft();
              if (readActiveWorkoutDraft() !== null) return false;
            }
            window.dispatchEvent(new CustomEvent(REMOTE_WORKOUT_APPLIED, { detail: draft }));
            return true;
          } finally {
            applying = false;
          }
        },
        saveBase: (base) => {
          try {
            localStorage.setItem(ACTIVE_WORKOUT_SYNC_KEY, JSON.stringify({ userId, base }));
          } catch {
            /* A subsequent reload compares with the server before replacing anything. */
          }
        },
        changed: (status, conflict, error) => setState({ status, conflict, error }),
      },
      savedBase,
    );
    controller.current = currentSync = sync;
    const wake = () => {
      window.clearTimeout(timer);
      void sync.sync();
    };
    const changed = () => {
      if (applying) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(wake, 400);
    };
    const storage = (event: StorageEvent) => {
      if (event.key === ACTIVE_WORKOUT_DRAFT_KEY || event.key === null) {
        window.dispatchEvent(
          new CustomEvent(REMOTE_WORKOUT_APPLIED, { detail: readActiveWorkoutDraft() }),
        );
        wake();
      }
    };
    const visible = () => {
      if (document.visibilityState === 'visible') wake();
    };
    wake();
    const fallback = window.setInterval(() => {
      if (document.visibilityState === 'visible') wake();
    }, 30_000);
    window.addEventListener(ACTIVE_WORKOUT_CHANGE_EVENT, changed);
    window.addEventListener(SHARED_WORKOUT_CHANGED, wake);
    window.addEventListener(FINISHED_WORKOUTS_CHANGE_EVENT, wake);
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visible);
    return () => {
      sync.stop();
      if (currentSync === sync) currentSync = null;
      controller.current = null;
      window.clearTimeout(timer);
      window.clearInterval(fallback);
      window.removeEventListener(ACTIVE_WORKOUT_CHANGE_EVENT, changed);
      window.removeEventListener(SHARED_WORKOUT_CHANGED, wake);
      window.removeEventListener(FINISHED_WORKOUTS_CHANGE_EVENT, wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [userId]);
  return {
    ...state,
    retry: () => void controller.current?.sync(),
    resolve: (useLocal: boolean) => void controller.current?.resolve(useLocal),
  };
}
