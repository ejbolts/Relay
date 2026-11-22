import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { readJson, writeJson } from '../../data/deviceStorage';

// The account data a workout needs keeps a copy on the phone, so a workout started or restored
// offline after the app was closed still has its exercises, weight unit, workout types and
// last-session suggestions. Copies belong to one account and are refreshed whenever the queries
// load; they only fill in until the server answers.

const INDEX = 'relay.mobile.query-cache.v1';
const entryKey = (queryKey: QueryKey) => `${INDEX}:${JSON.stringify(queryKey)}`;

/** Query key prefixes (see src/data/queries.ts) kept for offline use. */
export const OFFLINE_QUERIES = [
  'exercises',
  'workout-types',
  'workout-type-exercises',
  'training-preferences',
  'workouts',
  'dashboard',
] as const;

interface Index {
  userId: string;
  keys: string[];
}

interface Entry {
  queryKey: QueryKey;
  data: unknown;
  updatedAt: number;
}

const kept = (queryKey: QueryKey) =>
  OFFLINE_QUERIES.includes(queryKey[0] as (typeof OFFLINE_QUERIES)[number]);

function readIndex(): Index | null {
  const index = readJson<Index>(INDEX);
  return index && typeof index.userId === 'string' && Array.isArray(index.keys) ? index : null;
}

/** Removes every saved copy, as when the account signs out. */
export function forgetOfflineQueries() {
  for (const key of readIndex()?.keys ?? []) writeJson(key, null);
  writeJson(INDEX, null);
}

/**
 * Fills the query cache from the copies saved for `userId`, leaving fresher data alone. Copies of
 * another account are removed. Call it before the queries first read the cache.
 */
export function seedOfflineQueries(client: QueryClient, userId: string) {
  const index = readIndex();
  if (!index) return;
  if (index.userId !== userId) {
    forgetOfflineQueries();
    return;
  }
  for (const key of index.keys) {
    const entry = readJson<Entry>(key);
    if (!entry || !Array.isArray(entry.queryKey)) continue;
    if (client.getQueryData(entry.queryKey) !== undefined) continue;
    // Saved copies are old by definition: the queries still refetch when they can.
    client.setQueryData(entry.queryKey, entry.data, { updatedAt: 0 });
  }
}

/** Saves each kept query for `userId` whenever it loads. Returns the unsubscribe function. */
export function saveOfflineQueries(client: QueryClient, userId: string): () => void {
  const existing = readIndex();
  const index: Index = existing?.userId === userId ? existing : { userId, keys: [] };
  return client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    const { queryKey, state } = event.query;
    if (!kept(queryKey) || state.data === undefined || state.dataUpdatedAt === 0) return;
    const key = entryKey(queryKey);
    // One copy per query: a newer day's dashboard replaces yesterday's.
    const prefix = `${INDEX}:${JSON.stringify([queryKey[0]]).slice(0, -1)}`;
    const stale = index.keys.filter((item) => item !== key && item.startsWith(prefix));
    for (const item of stale) writeJson(item, null);
    if (
      !writeJson(key, {
        queryKey,
        data: state.data,
        updatedAt: state.dataUpdatedAt,
      })
    )
      return;
    index.keys = [...index.keys.filter((item) => !stale.includes(item) && item !== key), key];
    writeJson(INDEX, index);
  });
}
