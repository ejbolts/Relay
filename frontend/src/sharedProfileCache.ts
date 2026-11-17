import { api } from './api';
import { SHARED_WORKOUT_PAGE_SIZE } from './sharedProfileDisplay';
import type {
  SharedProfile,
  SharedWorkoutFilterOptions,
  SharedWorkoutPage,
  TrackedWorkout,
  WorkoutReactions,
} from './types';

/** What a shared profile screen needs to draw: the profile, its newest workouts and filters. */
export interface SharedProfileData {
  profile: SharedProfile;
  /** The first page of workouts with no filters applied. */
  page: SharedWorkoutPage;
  options: SharedWorkoutFilterOptions;
}

export interface CachedSharedProfile extends SharedProfileData {
  fetchedAt: number;
  signature: string | null;
}
type Entry = CachedSharedProfile;

/** Friends warmed in the background from the top of the Friends tab. */
export const PREFETCH_LIMIT = 5;
/** A copy this old is no longer shown while the fresh one loads. */
const SHOW_MAX_AGE_MS = 10 * 60_000;
/** Background warming leaves a copy alone until it is this old or the friend logs a session. */
const REFRESH_AFTER_MS = 5 * 60_000;
const MAX_ENTRIES = 12;

// Held in memory only, for the signed-in account: nothing is written to the device.
let viewer: string | null = null;
const entries = new Map<string, Entry>();
const inFlight = new Map<string, Promise<SharedProfileData | null>>();

function scope(viewerId: string | null) {
  if (viewer === viewerId) return;
  viewer = viewerId;
  entries.clear();
  inFlight.clear();
}

export function clearSharedProfileCache() {
  viewer = null;
  entries.clear();
  inFlight.clear();
}

/** A recent copy of the profile, or null when there is none worth showing. */
export function cachedSharedProfile(
  viewerId: string | null,
  profileId: string,
  now = Date.now(),
): CachedSharedProfile | null {
  scope(viewerId);
  const entry = entries.get(profileId);
  if (!entry) return null;
  if (now - entry.fetchedAt > SHOW_MAX_AGE_MS) {
    entries.delete(profileId);
    return null;
  }
  return entry;
}

export function storeSharedProfile(
  viewerId: string | null,
  profileId: string,
  data: SharedProfileData,
  signature: string | null = null,
  now = Date.now(),
) {
  scope(viewerId);
  const previous = entries.get(profileId);
  entries.delete(profileId);
  entries.set(profileId, {
    profile: data.profile,
    page: data.page,
    options: data.options,
    fetchedAt: now,
    signature: signature ?? previous?.signature ?? null,
  });
  // Drop the copy used longest ago.
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
}

/** Forget a profile whose access changed, so an old copy cannot be shown. */
export function forgetSharedProfile(viewerId: string | null, profileId: string) {
  scope(viewerId);
  entries.delete(profileId);
  inFlight.delete(profileId);
}

/** Keep a reaction made on the profile, so reopening it does not show the earlier count. */
export function updateCachedReactions(
  viewerId: string | null,
  profileId: string,
  workoutId: string,
  reactions: WorkoutReactions,
) {
  scope(viewerId);
  const entry = entries.get(profileId);
  if (!entry || !entry.page.workouts.some((workout) => workout.id === workoutId)) return;
  entry.page = { ...entry.page, reactions: { ...entry.page.reactions, [workoutId]: reactions } };
}

/** A background load of this profile that is still under way, if any. */
export function pendingSharedProfile(
  viewerId: string | null,
  profileId: string,
): Promise<SharedProfileData | null> | null {
  scope(viewerId);
  return inFlight.get(profileId) ?? null;
}

function cannotPrefetch(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return true;
  if (navigator.onLine === false || document.visibilityState === 'hidden') return true;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/**
 * Loads a friend's profile ahead of opening it. Skipped while offline, hidden or saving data, and
 * when a recent copy already matches `signature`. A failed load is dropped silently: opening the
 * profile then loads it as usual.
 */
export function prefetchSharedProfile(
  viewerId: string | null,
  profileId: string,
  signature: string | null = null,
  now = Date.now(),
): Promise<SharedProfileData | null> {
  scope(viewerId);
  const running = inFlight.get(profileId);
  if (running) return running;
  const entry = entries.get(profileId);
  if (
    entry &&
    now - entry.fetchedAt < REFRESH_AFTER_MS &&
    (signature === null || entry.signature === signature)
  ) {
    return Promise.resolve(entry);
  }
  if (cannotPrefetch()) return Promise.resolve(null);
  const request = Promise.all([
    api.sharing.profile(profileId),
    api.sharing.workouts(profileId, 0, SHARED_WORKOUT_PAGE_SIZE, {}),
    api.sharing.workoutFilters(profileId),
  ])
    .then(([profile, page, options]) => {
      // Signing out or forgetting the profile while it loaded discards the answer.
      if (inFlight.get(profileId) !== request) return null;
      const data = { profile, page, options };
      storeSharedProfile(viewerId, profileId, data, signature);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      if (inFlight.get(profileId) === request) inFlight.delete(profileId);
    });
  inFlight.set(profileId, request);
  return request;
}

/**
 * Warms the first few profiles in a list, one at a time and only while the browser is idle, so
 * it never competes with what is on screen. Returns a function that stops the remaining loads.
 */
export function prefetchSharedProfiles(
  viewerId: string | null,
  targets: { id: string; signature: string | null }[],
  limit = PREFETCH_LIMIT,
): () => void {
  let stopped = false;
  let handle: number | null = null;
  const queue = targets.slice(0, limit);
  const idle =
    typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
      ? {
          start: (run: () => void) => window.requestIdleCallback(run, { timeout: 2000 }),
          stop: (id: number) => window.cancelIdleCallback(id),
        }
      : {
          start: (run: () => void) => window.setTimeout(run, 250),
          stop: (id: number) => window.clearTimeout(id),
        };
  function next() {
    handle = null;
    if (stopped) return;
    const target = queue.shift();
    if (!target) return;
    void prefetchSharedProfile(viewerId, target.id, target.signature).then(() => {
      if (!stopped && queue.length) handle = idle.start(next);
    });
  }
  if (queue.length && typeof window !== 'undefined') handle = idle.start(next);
  return () => {
    stopped = true;
    if (handle !== null) idle.stop(handle);
  };
}

/**
 * What to show at once for an opening, taken from a cached first page. A link to one workout
 * shows that day's sessions when the workout is among them; otherwise the workouts wait for the
 * server while the profile itself still appears straight away.
 */
export function workoutsFromCache(
  page: SharedWorkoutPage,
  target?: Pick<TrackedWorkout, 'id' | 'workout_date'>,
): SharedWorkoutPage | null {
  if (!target) return page;
  if (!page.workouts.some((workout) => workout.id === target.id)) return null;
  const workouts = page.workouts.filter((workout) => workout.workout_date === target.workout_date);
  const ids = new Set(workouts.map((workout) => workout.id));
  return {
    total: workouts.length,
    workouts,
    personal_records: page.personal_records.filter((record) => ids.has(record.workout_id)),
    reactions: Object.fromEntries(
      Object.entries(page.reactions ?? {}).filter(([workoutId]) => ids.has(workoutId)),
    ),
  };
}
