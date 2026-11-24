import { useSyncExternalStore } from 'react';
import {
  finishedWorkoutKey,
  readFinishedWorkouts,
  type FinishedWorkout,
} from '../../../../frontend/src/finishedWorkoutQueue';
import type { FinishedMuscleSource } from '../../../../frontend/src/liveMuscleSets';
import { previewIdFor } from '../../../../frontend/src/pendingWorkoutPreview';
import type { DashboardData, Exercise } from '../../../../frontend/src/types';
import {
  readActiveWorkoutDraft,
  type ActiveWorkoutDraft,
} from '../../../../frontend/src/workoutDraft';
import { deviceStorage, readJson } from '../../data/deviceStorage';

/** Which account owns the stored active draft, matching WorkoutProvider's DRAFT_OWNER_KEY. */
const DRAFT_OWNER_KEY = 'relay.mobile.active-workout-owner.v1';

/** A finished workout the server just confirmed, held until the refreshed dashboard includes it. */
export interface SavedMuscleSource {
  id: string;
  draft: FinishedWorkout;
  dashboard: DashboardData | null;
  dashboardUpdatedAt: number;
}

export interface LiveWorkoutSourcesSnapshot {
  owner: string | null;
  draft: ActiveWorkoutDraft | null;
  exercises: Exercise[];
  refusals: Readonly<Record<string, string>>;
  saved: readonly SavedMuscleSource[];
  queueRevision: number;
}

const EMPTY_REFUSALS: Readonly<Record<string, string>> = {};
const EMPTY_EXERCISES: Exercise[] = [];
const EMPTY_SAVED: readonly SavedMuscleSource[] = [];

const EMPTY_SNAPSHOT: LiveWorkoutSourcesSnapshot = {
  owner: null,
  draft: null,
  exercises: EMPTY_EXERCISES,
  refusals: EMPTY_REFUSALS,
  saved: EMPTY_SAVED,
  queueRevision: 0,
};

let snapshot: LiveWorkoutSourcesSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Publishes the signed-in account's live workout draft, exercises and queue state. */
export function publishLiveWorkoutSources(update: {
  owner: string;
  draft: ActiveWorkoutDraft | null;
  exercises: Exercise[];
  refusals: Readonly<Record<string, string>>;
  /** Count of waiting finished workouts, so queue drains re-read storage even without refusals. */
  waiting?: number;
}) {
  const sameOwner = snapshot.owner === update.owner;
  snapshot = {
    owner: update.owner,
    draft: update.draft,
    exercises: update.exercises,
    refusals: update.refusals,
    saved: sameOwner ? snapshot.saved : EMPTY_SAVED,
    queueRevision: snapshot.queueRevision + 1 + (update.waiting ?? 0) * 0,
  };
  emit();
}

/**
 * Holds a workout the server just confirmed until the dashboard query refreshes past the copy
 * that was loaded when the save completed, as the web's `savedPreviews` does.
 */
export function rememberSavedWorkout(
  owner: string,
  workoutId: string,
  draft: FinishedWorkout,
  dashboard: DashboardData | null,
  dashboardUpdatedAt: number,
) {
  const current = snapshot.owner === owner ? snapshot.saved : EMPTY_SAVED;
  const kept = current.filter(
    (item) =>
      item.id !== workoutId &&
      item.dashboard === dashboard &&
      item.dashboardUpdatedAt === dashboardUpdatedAt,
  );
  snapshot = {
    ...snapshot,
    owner,
    saved: [...kept, { id: workoutId, draft, dashboard, dashboardUpdatedAt }],
    queueRevision: snapshot.queueRevision + 1,
  };
  emit();
}

/** Drops just-saved workouts once the dashboard has refreshed past them. */
export function pruneSavedWorkouts(
  owner: string,
  dashboard: DashboardData | null,
  dashboardUpdatedAt: number,
) {
  if (snapshot.owner !== owner || snapshot.saved.length === 0) return;
  const kept = snapshot.saved.filter(
    (item) => item.dashboard === dashboard && item.dashboardUpdatedAt === dashboardUpdatedAt,
  );
  if (kept.length === snapshot.saved.length) return;
  snapshot = { ...snapshot, saved: kept };
  emit();
}

/** Clears published live sources on sign-out or account switch. */
export function clearLiveWorkoutSources(owner?: string) {
  if (owner !== undefined && snapshot.owner !== owner) return;
  if (snapshot === EMPTY_SNAPSHOT) return;
  snapshot = EMPTY_SNAPSHOT;
  emit();
}

/** Subscribes to the active workout draft, queue state and just-saved workouts. */
export function useLiveWorkoutSources(): LiveWorkoutSourcesSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/**
 * Collects the unsaved live draft and finished workouts (just-saved awaiting dashboard refresh,
 * plus queued non-refused saves) for `userId`. When `WorkoutProvider` is not mounted (as in
 * isolated tests), falls back to reading this account's stored draft and finished queue directly.
 */
export function reviewWorkoutSources(
  userId: string,
  sources: LiveWorkoutSourcesSnapshot,
  dashboard: DashboardData | null,
  dashboardUpdatedAt: number,
): {
  draft: ActiveWorkoutDraft | null;
  finished: FinishedMuscleSource[];
  exercises: Exercise[];
} {
  const activeOwner = sources.owner === userId;
  const refusals = activeOwner ? sources.refusals : EMPTY_REFUSALS;
  const awaitingDashboard = activeOwner
    ? sources.saved
        .filter(
          (item) => item.dashboard === dashboard && item.dashboardUpdatedAt === dashboardUpdatedAt,
        )
        .map((item) => ({ id: item.id, draft: item.draft }))
    : [];
  const waiting = readFinishedWorkouts(deviceStorage)
    .filter((item) => item.pendingSave.userId === userId && !(finishedWorkoutKey(item) in refusals))
    .map((item) => ({ id: previewIdFor(item.pendingSave), draft: item }));

  let draft: ActiveWorkoutDraft | null;
  if (activeOwner) {
    draft = sources.draft?.pendingSave ? null : sources.draft;
  } else {
    const stored = readActiveWorkoutDraft(deviceStorage);
    const storedOwner = readJson<string>(DRAFT_OWNER_KEY);
    draft = stored && !stored.pendingSave && storedOwner === userId ? stored : null;
  }

  return {
    draft,
    finished: [...awaitingDashboard, ...waiting],
    exercises: activeOwner ? sources.exercises : EMPTY_EXERCISES,
  };
}
