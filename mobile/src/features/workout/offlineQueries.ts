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
  'training-blocks',
] as const;

/** Reads under `workouts` kept besides the history window itself (`['workouts', start]`). */
const KEPT_WORKOUT_READS = ['baselines', 'body-measurements'];

/**
 * The copy a query keeps, one per family so a newer day's dashboard replaces yesterday's, or null
 * for a query that is not kept (such as one saved workout or an older page of history).
 */
function familyOf(queryKey: QueryKey): string | null {
  const [first, second] = queryKey;
  if (first === 'workouts') {
    if (typeof second === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(second)) return 'workouts';
    return typeof second === 'string' && KEPT_WORKOUT_READS.includes(second)
      ? `workouts/${second}`
      : null;
  }
  return OFFLINE_QUERIES.includes(first as (typeof OFFLINE_QUERIES)[number]) ? String(first) : null;
}

const familyOfEntry = (key: string) => {
  try {
    return familyOf(JSON.parse(key.slice(INDEX.length + 1)) as QueryKey);
  } catch {
    return null;
  }
};

interface Index {
  userId: string;
  keys: string[];
}

interface Entry {
  queryKey: QueryKey;
  data: unknown;
  updatedAt: number;
}

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
    const family = familyOf(queryKey);
    if (!family || state.data === undefined || state.dataUpdatedAt === 0) return;
    const key = entryKey(queryKey);
    const stale = index.keys.filter((item) => item !== key && familyOfEntry(item) === family);
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
