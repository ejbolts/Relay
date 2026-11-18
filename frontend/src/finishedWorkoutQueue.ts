import {
  ACTIVE_WORKOUT_DRAFT_KEY,
  clearActiveWorkoutDraft,
  isActiveWorkoutDraft,
  readActiveWorkoutDraft,
  type ActiveWorkoutDraft,
  type DraftStorage,
  type PendingWorkoutSave,
} from './workoutDraft';

/**
 * Finished workouts that have not reached the server, oldest first. Each keeps its whole draft,
 * so a save the server refuses can reopen in the logger for review. Keeping them apart from the
 * active-workout draft lets a new workout start while earlier ones wait to sync.
 */
export const FINISHED_WORKOUTS_KEY = 'gym-video-logger.finished-workouts.v1';
/** Dispatched on `window` when this window changes the finished-workout queue. */
export const FINISHED_WORKOUTS_CHANGE_EVENT = 'relay:finished-workouts-change';

export type FinishedWorkout = ActiveWorkoutDraft & { pendingSave: PendingWorkoutSave };

interface StoredQueue {
  version: 1;
  items: unknown[];
}

function browserStorage(): DraftStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function target(storage?: DraftStorage | null): DraftStorage | null {
  return storage === undefined ? browserStorage() : storage;
}

function isFinishedWorkout(value: unknown): value is FinishedWorkout {
  return isActiveWorkoutDraft(value) && value.pendingSave !== undefined;
}

/** Stable identity: the session for a new workout, the workout and finish time for a resumed one. */
export function finishedWorkoutKey(item: Pick<FinishedWorkout, 'pendingSave'>): string {
  const { payload, workoutId, finishedAt } = item.pendingSave;
  return payload.client_session_id ?? `${workoutId}@${finishedAt}`;
}

function readStored(storage: DraftStorage): FinishedWorkout[] {
  try {
    const parsed = JSON.parse(storage.getItem(FINISHED_WORKOUTS_KEY) ?? 'null') as StoredQueue;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) return [];
    // One damaged entry must not hide the others.
    return parsed.items.filter(isFinishedWorkout);
  } catch {
    return [];
  }
}

function writeStored(storage: DraftStorage, items: FinishedWorkout[], announce: boolean): boolean {
  try {
    if (items.length) storage.setItem(FINISHED_WORKOUTS_KEY, JSON.stringify({ version: 1, items }));
    else storage.removeItem(FINISHED_WORKOUTS_KEY);
  } catch {
    return false;
  }
  if (announce && typeof window !== 'undefined')
    window.dispatchEvent(new Event(FINISHED_WORKOUTS_CHANGE_EVENT));
  return true;
}

function byFinish(left: FinishedWorkout, right: FinishedWorkout): number {
  return left.pendingSave.finishedAt - right.pendingSave.finishedAt;
}

/**
 * Every finished workout waiting to sync, oldest first. Releases before the queue kept one
 * finished workout inside the active draft; that one is included until it is moved.
 */
export function readFinishedWorkouts(storage?: DraftStorage | null): FinishedWorkout[] {
  const store = target(storage);
  if (!store) return [];
  const items = readStored(store);
  const legacy = readActiveWorkoutDraft(store);
  if (
    legacy?.pendingSave &&
    !items.some(
      (item) => finishedWorkoutKey(item) === finishedWorkoutKey(legacy as FinishedWorkout),
    )
  )
    items.push(legacy as FinishedWorkout);
  return items.sort(byFinish);
}

/** Adds a finished workout, replacing one with the same identity. False when storage refuses. */
export function addFinishedWorkout(item: FinishedWorkout, storage?: DraftStorage | null): boolean {
  const store = target(storage);
  if (!store) return false;
  const key = finishedWorkoutKey(item);
  const items = readStored(store).filter((existing) => finishedWorkoutKey(existing) !== key);
  return writeStored(store, [...items, item].sort(byFinish), storage === undefined);
}

/** Removes a finished workout, including one still held in an older release's draft. */
export function removeFinishedWorkout(key: string, storage?: DraftStorage | null): void {
  const store = target(storage);
  if (!store) return;
  const items = readStored(store);
  const remaining = items.filter((item) => finishedWorkoutKey(item) !== key);
  if (remaining.length !== items.length) writeStored(store, remaining, storage === undefined);
  const legacy = readActiveWorkoutDraft(store);
  if (legacy?.pendingSave && finishedWorkoutKey(legacy as FinishedWorkout) === key)
    clearActiveWorkoutDraft(storage);
}

/**
 * Moves a finished workout an older release left in the active draft into the queue, freeing the
 * draft for a new workout. The queue is written first, so a failure leaves it where it was.
 */
export function moveLegacyFinishedWorkout(storage?: DraftStorage | null): void {
  const store = target(storage);
  if (!store) return;
  const legacy = readActiveWorkoutDraft(store);
  if (!legacy?.pendingSave) return;
  const serialized = store.getItem(ACTIVE_WORKOUT_DRAFT_KEY);
  if (!addFinishedWorkout(legacy as FinishedWorkout, storage)) return;
  // Only clear the draft that was moved, never one another tab has written since.
  if (store.getItem(ACTIVE_WORKOUT_DRAFT_KEY) === serialized) clearActiveWorkoutDraft(storage);
}

/** Keeps only the finished workouts of the account now using this device. */
export function keepFinishedWorkoutsFor(
  userId: string | null,
  storage?: DraftStorage | null,
): void {
  const store = target(storage);
  if (!store) return;
  const items = readStored(store);
  const kept = items.filter((item) => item.pendingSave.userId === userId);
  if (kept.length !== items.length) writeStored(store, kept, storage === undefined);
  const legacy = readActiveWorkoutDraft(store);
  if (legacy?.pendingSave && legacy.pendingSave.userId !== userId) clearActiveWorkoutDraft(storage);
}

export function clearFinishedWorkouts(storage?: DraftStorage | null): void {
  const store = target(storage);
  if (store) writeStored(store, [], storage === undefined);
}
