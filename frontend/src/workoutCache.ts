import { readLastUser } from './deviceAccount';
import { clearOffline, deleteOffline, readOffline, writeOffline } from './offlineStore';
import type { DashboardData, TrackedWorkout } from './types';

const WORKOUT_CACHE_KEY = 'workouts-v2';
export const DASHBOARD_CACHE_KEY = 'dashboard-v2';
/** Unencrypted snapshots written by earlier releases. */
const LEGACY_CACHE_KEYS = ['workouts-v1', 'dashboard-v1'];

export interface CachedWorkoutSnapshot {
  revision: string;
  workouts: TrackedWorkout[];
  /** The oldest workout date the snapshot covers. */
  since: string;
}

let legacyRemoved = false;

async function readAccountValue<T>(key: string): Promise<T | null> {
  const owner = readLastUser()?.id;
  if (!owner) return null;
  return (await readOffline<T>(key, owner))?.value ?? null;
}

async function writeAccountValue(key: string, value: unknown): Promise<void> {
  const owner = readLastUser()?.id;
  if (!owner) return;
  if (!legacyRemoved) {
    legacyRemoved = true;
    await deleteOffline(LEGACY_CACHE_KEYS);
  }
  await writeOffline(key, value, owner);
}

function isWorkoutSnapshot(value: unknown): value is CachedWorkoutSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const snapshot = value as Partial<CachedWorkoutSnapshot>;
  return (
    typeof snapshot.revision === 'string' &&
    typeof snapshot.since === 'string' &&
    Array.isArray(snapshot.workouts)
  );
}

export async function readWorkoutCache(): Promise<CachedWorkoutSnapshot | null> {
  const cached = await readAccountValue<unknown>(WORKOUT_CACHE_KEY);
  return isWorkoutSnapshot(cached) ? cached : null;
}

export async function writeWorkoutCache(snapshot: CachedWorkoutSnapshot): Promise<void> {
  return writeAccountValue(WORKOUT_CACHE_KEY, snapshot);
}

export async function readDashboardCache(): Promise<DashboardData | null> {
  return readAccountValue<DashboardData>(DASHBOARD_CACHE_KEY);
}

export async function writeDashboardCache(dashboard: DashboardData): Promise<void> {
  return writeAccountValue(DASHBOARD_CACHE_KEY, dashboard);
}

/** Removes every saved record and its key. Used on sign-out and when the account changes. */
export async function clearWorkoutCache(): Promise<void> {
  return clearOffline();
}

/** Cached workouts from `since` onwards, whatever their revision, when the cache reaches that far. */
export function cachedWorkoutsSince(
  cached: CachedWorkoutSnapshot | null,
  since: string,
): TrackedWorkout[] | null {
  if (!cached || cached.since > since) return null;
  return cached.workouts.filter((workout) => workout.workout_date >= since);
}

/** Cached workouts from `since` onwards, when the cache is current and reaches back that far. */
export function cachedWorkoutsForRevision(
  cached: CachedWorkoutSnapshot | null,
  revision: string,
  since: string,
): TrackedWorkout[] | null {
  return cached?.revision === revision ? cachedWorkoutsSince(cached, since) : null;
}
