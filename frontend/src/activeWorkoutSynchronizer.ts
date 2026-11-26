import { inactiveWorkoutFinishAt } from './activeWorkoutTimeout';
import type { ActiveWorkoutDraft } from './workoutDraft';

// How the workout in progress stays the same on every device signed in to an account, through
// /api/active-workout: one request at a time, with the last acknowledged revision kept as the
// base for three-way merges, so offline edits on two devices combine instead of overwriting.
// Plain TypeScript with no React or browser APIs: the web's useActiveWorkoutSync and the native
// app (mobile/) both run it, each supplying its own requests and storage.

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

export interface SyncDependencies {
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
  /** Whether a failed request never reached the server (offline, timed out, proxy down). */
  connectionFailure: (reason: unknown) => boolean;
  /** A new session id, for keeping a workout another device already ended. */
  newId: () => string;
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
  private lastError: string | null = null;
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
    this.lastError = error;
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
        // A choice already made replaces the other version, even before any base was agreed.
        if (!this.base && !this.replacement) {
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
        const base = (this.base ?? this.replacement)!;
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
      this.connectionFailure = this.deps.connectionFailure(reason);
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
            clientSessionId: this.deps.newId(),
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
      throw new Error(
        this.lastError
          ? `Could not sync the workout: ${this.lastError}`
          : 'Could not sync the workout. Try again before finishing.',
      );
    }
    return this.base?.draft?.clientSessionId === before?.clientSessionId && this.base?.revision
      ? {
          active_workout_revision: this.base.revision,
          active_workout_session_id: before?.clientSessionId,
        }
      : {};
  }
}
