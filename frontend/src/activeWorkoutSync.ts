import { useEffect, useRef, useState } from 'react';
import { api, isConnectionFailure } from './api';
import { inactiveWorkoutFinishAt } from './activeWorkoutTimeout';
import {
  ACTIVE_WORKOUT_SYNC_KEY,
  REMOTE_WORKOUT_APPLIED,
  SHARED_WORKOUT_CHANGED,
} from './activeWorkoutEvents';
import { readFinishedWorkouts, FINISHED_WORKOUTS_CHANGE_EVENT } from './finishedWorkoutQueue';
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

export interface SharedWorkoutSnapshot {
  revision: number;
  draft: ActiveWorkoutDraft | null;
}
export type WorkoutSyncStatus = 'synced' | 'syncing' | 'offline' | 'conflict';
export interface WorkoutSyncConflict {
  local: ActiveWorkoutDraft | null;
  remote: SharedWorkoutSnapshot;
}

/** Object order and persistence-only timestamps must not produce edits or sync loops. */
export function draftSignature(value: ActiveWorkoutDraft | null): string {
  return JSON.stringify(value, (key, item: unknown) => {
    if (key === 'updatedAt') return undefined;
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    }
    return item;
  });
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

interface SyncDependencies {
  read: () => Promise<SharedWorkoutSnapshot>;
  put: (
    change: SharedWorkoutSnapshot & { base: ActiveWorkoutDraft | null; replace?: boolean },
  ) => Promise<SharedWorkoutSnapshot & { conflict: boolean }>;
  local: () => ActiveWorkoutDraft | null;
  apply: (draft: ActiveWorkoutDraft | null) => boolean;
  saveBase: (base: SharedWorkoutSnapshot) => void;
  queued: (sessionId: string | undefined) => boolean;
  changed: (
    status: WorkoutSyncStatus,
    conflict: WorkoutSyncConflict | null,
    error: string | null,
  ) => void;
}

/** One request at a time; keep the acknowledged base durable for offline three-way merging. */
export class ActiveWorkoutSynchronizer {
  private base: SharedWorkoutSnapshot | null;
  private running: Promise<void> | null = null;
  private again = false;
  private stopped = false;
  private conflict: WorkoutSyncConflict | null = null;
  private replacement: SharedWorkoutSnapshot | null = null;
  private connectionFailure = false;
  status: WorkoutSyncStatus = 'syncing';

  constructor(
    private deps: SyncDependencies,
    base: SharedWorkoutSnapshot | null = null,
  ) {
    this.base = base;
  }

  stop() {
    this.stopped = true;
  }

  private report(status: WorkoutSyncStatus, error: string | null = null) {
    this.status = status;
    this.deps.changed(status, this.conflict, error);
  }

  private remember(base: SharedWorkoutSnapshot) {
    this.base = base;
    this.deps.saveBase(base);
  }

  private accept(remote: SharedWorkoutSnapshot) {
    if (!this.deps.apply(remote.draft))
      throw new Error('Could not store the synced workout on this device.');
    this.remember(remote);
  }

  sync(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.again = true;
    if (this.running) return this.running;
    this.running = this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async drain() {
    try {
      while (this.again && !this.stopped) {
        this.again = false;
        if (this.conflict && !this.replacement) {
          // Refresh the comparison without replacing either device's edits.
          const remote = await this.deps.read();
          if (this.stopped) return;
          this.conflict = { local: this.deps.local(), remote };
          this.report('conflict');
          return;
        }
        this.report('syncing');
        if (!this.base) {
          const remote = await this.deps.read();
          if (this.stopped) return;
          const local = this.deps.local();
          if (!local && this.deps.queued(remote.draft?.clientSessionId)) this.remember(remote);
          else if (!local) this.accept(remote);
          else if (!remote.draft || draftSignature(local) === draftSignature(remote.draft))
            this.remember(remote);
          else {
            this.conflict = { local, remote };
            this.report('conflict');
            return;
          }
        }
        const base = this.base!;
        // The completion queue owns a finished draft until the save succeeds or needs review.
        if (this.deps.queued(base.draft?.clientSessionId)) {
          const remote = await this.deps.read();
          if (this.stopped) return;
          if (remote.draft?.clientSessionId === base.draft?.clientSessionId) {
            this.report('synced');
            return;
          }
          this.remember(remote);
          this.again = true;
          continue;
        }
        const sent = this.deps.local();
        if (sent?.pendingSave) return;
        if (!this.replacement && draftSignature(sent) === draftSignature(base.draft)) {
          const remote = await this.deps.read();
          if (this.stopped) return;
          if (draftSignature(this.deps.local()) !== draftSignature(sent)) {
            this.again = true;
            continue;
          }
          this.accept(remote);
          this.report('synced');
          continue;
        }
        const replacing = this.replacement;
        this.replacement = null;
        const response = await this.deps.put({
          revision: (replacing ?? base).revision,
          base: (replacing ?? base).draft,
          draft: sent,
          ...(replacing && { replace: true }),
        });
        if (this.stopped) return;
        if (response.conflict) {
          this.conflict = { local: this.deps.local(), remote: response };
          this.report('conflict');
          return;
        }
        this.conflict = null;
        if (draftSignature(this.deps.local()) === draftSignature(sent)) {
          this.accept(response);
          this.report('synced');
        } else {
          // New keystrokes arrived during the request. Merge those against exactly what was
          // sent, so the next server merge retains remote changes without rolling back input.
          this.remember({ revision: response.revision, draft: sent });
          this.again = true;
        }
      }
    } catch (reason) {
      this.connectionFailure = isConnectionFailure(reason);
      if (!this.stopped)
        this.report('offline', reason instanceof Error ? reason.message : 'Workout sync failed.');
    }
  }

  async resolve(useLocal: boolean) {
    const conflict = this.conflict;
    if (!conflict) return;
    if (!useLocal) {
      this.accept(conflict.remote);
      this.conflict = null;
      this.report('synced');
    } else {
      const local = this.deps.local();
      if (local && local.clientSessionId !== conflict.remote.draft?.clientSessionId) {
        // Keeping an ended workout explicitly creates a new session; never revive its old id.
        const now = Date.now();
        if (
          !this.deps.apply({
            ...local,
            clientSessionId: crypto.randomUUID(),
            lastActiveAt: now,
            inactiveFinishAt: inactiveWorkoutFinishAt(local.startedAt, now),
            updatedAt: now,
          })
        )
          return;
      }
      this.replacement = conflict.remote;
      this.conflict = null;
    }
    await this.sync();
  }

  async finishFields(): Promise<{
    active_workout_revision?: number;
    active_workout_session_id?: string;
  }> {
    const before = this.deps.local();
    await this.sync();
    if (this.conflict) throw new Error('Resolve the workout sync conflict before finishing.');
    if (draftSignature(before) !== draftSignature(this.deps.local())) {
      throw new Error(
        'Workout updated from another device. Review the latest sets, then finish again.',
      );
    }
    if (this.status === 'offline' && this.connectionFailure) {
      // A queued offline completion still uses its last known revision. A concurrent edit
      // will be refused when it reconnects, with the finished copy retained for review.
    } else if (this.status !== 'synced') {
      throw new Error('Could not sync the workout. Try again before finishing.');
    }
    return this.base?.draft?.clientSessionId === before?.clientSessionId && this.base?.revision
      ? {
          active_workout_revision: this.base.revision,
          active_workout_session_id: before?.clientSessionId,
        }
      : {};
  }
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
