import { captureAccountCacheScope, type AccountCacheScope } from './accountCacheScope';
import { serverHasCheckIn } from './checkInSync';
import { browserAccountStorage, type AccountStorage } from './deviceAccount';
import { readOffline, writeOffline } from './offlineStore';
import { syncRetryDelay } from './syncBackoff';
import type { BodyMeasurement } from './types';

export type BodyMeasurementInput = Pick<
  BodyMeasurement,
  'measurement_date' | 'weight_kg' | 'body_fat_pct' | 'notes'
>;

// Like finished workout drafts, only unsynced changes are kept in localStorage for recovery
// after session expiry. Server history stays in the encrypted IndexedDB cache.
export const BODY_MEASUREMENT_QUEUE_KEY = 'relay-body-measurement-queue';
export const BODY_MEASUREMENTS_CHANGED = 'relay-body-measurements-changed';
const CACHE_KEY = 'response:/api/body-measurements';
const LOCAL_ID = 'local-body:';
interface Change {
  token: string;
  date: string;
  createdAt: string;
  payload: BodyMeasurementInput | null;
  error?: string;
}
interface Queue {
  owner: string;
  changes: Change[];
}
export interface BodyMeasurementTransport {
  list(signal?: AbortSignal): Promise<BodyMeasurement[]>;
  save(payload: BodyMeasurementInput, signal: AbortSignal): Promise<BodyMeasurement>;
  remove(id: string, signal: AbortSignal): Promise<void>;
}

let serial: Promise<unknown> = Promise.resolve();
let revision = 0;
/**
 * Attempts in a row that ended without a usable answer: a timeout, a dropped connection or a
 * server error. The server may still have saved such an attempt, so the next one asks what it
 * holds before sending anything again, and automatic attempts wait until `retryAfter`.
 */
let unanswered = 0;
let retryAfter = 0;

/** Forgets earlier unanswered attempts, so the next sync starts afresh. */
export function resetBodyMeasurementSyncBackoff(): void {
  unanswered = 0;
  retryAfter = 0;
}
function locked<T>(action: () => Promise<T>): Promise<T> {
  const run = () =>
    typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('relay-body-measurement-state', action)
      : action();
  const next = serial.then(run, run);
  serial = next.catch(() => undefined);
  return next;
}

function check(scope: AccountCacheScope): string {
  if (!scope.owner || !scope.isCurrent()) throw new Error('The signed-in account changed.');
  return scope.owner;
}
function queue(owner: string, storage = browserAccountStorage()): Queue {
  const raw = storage?.getItem(BODY_MEASUREMENT_QUEUE_KEY);
  if (!raw) return { owner, changes: [] };
  const saved = JSON.parse(raw) as Queue;
  if (!saved || !Array.isArray(saved.changes)) throw new Error('Could not read saved check-ins.');
  return saved.owner === owner ? saved : { owner, changes: [] };
}
function publish(rows?: BodyMeasurement[]) {
  ++revision;
  window.dispatchEvent(new CustomEvent(BODY_MEASUREMENTS_CHANGED, { detail: rows }));
}
function store(next: Queue, scope: AccountCacheScope) {
  check(scope);
  const storage = browserAccountStorage();
  if (!storage)
    throw new Error('Could not save on this device. Keep this check-in open and try again.');
  try {
    storage.setItem(BODY_MEASUREMENT_QUEUE_KEY, JSON.stringify(next));
  } catch {
    throw new Error('Could not save on this device. Free some storage and try again.');
  }
}
function persist(next: Queue, scope: AccountCacheScope) {
  store(next, scope);
  publish();
}

export function clearBodyMeasurementQueue(
  storage: AccountStorage | null = browserAccountStorage(),
) {
  storage?.removeItem(BODY_MEASUREMENT_QUEUE_KEY);
  resetBodyMeasurementSyncBackoff();
}
export function reconcileBodyMeasurementQueue(owner: string, storage: AccountStorage | null) {
  const raw = storage?.getItem(BODY_MEASUREMENT_QUEUE_KEY);
  if (raw && (JSON.parse(raw) as Queue).owner !== owner) clearBodyMeasurementQueue(storage);
}
export function bodyMeasurementSyncStatus() {
  const scope = captureAccountCacheScope();
  const changes = scope.owner ? queue(scope.owner).changes : [];
  return { pending: changes.length, error: changes.find((item) => item.error)?.error ?? null };
}

function overlay(rows: BodyMeasurement[], changes: Change[]): BodyMeasurement[] {
  const byDate = new Map(rows.map((row) => [row.measurement_date, row]));
  for (const change of changes) {
    if (change.payload) {
      const previous = byDate.get(change.date);
      byDate.set(change.date, {
        id: previous?.id ?? `${LOCAL_ID}${change.date}`,
        created_at: previous?.created_at ?? change.createdAt,
        is_sample: false,
        ...change.payload,
      });
    } else byDate.delete(change.date);
  }
  return [...byDate.values()].sort((a, b) => b.measurement_date.localeCompare(a.measurement_date));
}

async function readLocal(scope: AccountCacheScope) {
  const owner = check(scope);
  const saved = await readOffline<BodyMeasurement[]>(CACHE_KEY, owner);
  check(scope);
  return overlay(saved?.value ?? [], queue(owner).changes);
}

export function localBodyMeasurements() {
  const scope = captureAccountCacheScope();
  return locked(() => readLocal(scope));
}

export async function saveLocalBodyMeasurement(payload: BodyMeasurementInput) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(payload.measurement_date) ||
    !Number.isFinite(Date.parse(`${payload.measurement_date}T00:00:00Z`)) ||
    new Date(`${payload.measurement_date}T00:00:00Z`).toISOString().slice(0, 10) !==
      payload.measurement_date ||
    !Number.isFinite(payload.weight_kg) ||
    payload.weight_kg <= 0 ||
    payload.weight_kg > 500 ||
    (payload.body_fat_pct !== null &&
      (!Number.isFinite(payload.body_fat_pct) ||
        payload.body_fat_pct < 1 ||
        payload.body_fat_pct > 70)) ||
    (payload.notes?.length ?? 0) > 2000
  )
    throw new Error(
      'Enter a valid date, body weight and body-fat percentage. Notes can contain up to 2,000 characters.',
    );
  const scope = captureAccountCacheScope();
  return locked(async () => {
    const owner = check(scope);
    const next = queue(owner);
    const row = (await readLocal(scope)).find(
      (item) => item.measurement_date === payload.measurement_date,
    );
    next.changes = next.changes.filter((item) => item.date !== payload.measurement_date);
    next.changes.push({
      token: crypto.randomUUID(),
      date: payload.measurement_date,
      createdAt: row?.created_at ?? new Date().toISOString(),
      payload,
    });
    // A change just made here is sent at once, even during a pause left by earlier attempts.
    retryAfter = 0;
    persist(next, scope);
    return overlay(row ? [row] : [], next.changes).find(
      (item) => item.measurement_date === payload.measurement_date,
    )!;
  });
}

export async function deleteLocalBodyMeasurement(id: string) {
  const scope = captureAccountCacheScope();
  return locked(async () => {
    const owner = check(scope);
    const row = (await readLocal(scope)).find((item) => item.id === id);
    const date = id.startsWith(LOCAL_ID) ? id.slice(LOCAL_ID.length) : row?.measurement_date;
    if (!date) throw new Error('This check-in no longer exists. Refresh before trying again.');
    const next = queue(owner);
    next.changes = next.changes.filter((item) => item.date !== date);
    next.changes.push({
      token: crypto.randomUUID(),
      date,
      createdAt: new Date().toISOString(),
      payload: null,
    });
    retryAfter = 0;
    persist(next, scope);
  });
}

export async function refreshBodyMeasurements(transport: BodyMeasurementTransport) {
  const scope = captureAccountCacheScope();
  const owner = check(scope);
  const started = revision;
  const rows = await transport.list();
  return locked(async () => {
    check(scope);
    // A response started before a local save or sync must not replace its acknowledged result.
    if (started === revision) {
      await writeOffline(CACHE_KEY, rows, owner, scope.isCurrent);
      check(scope);
      // A save can reach the server without its answer reaching this device. What the server
      // already holds is done: stop waiting to send it, instead of sending it again.
      const waiting = queue(owner);
      const unsent = waiting.changes.filter((change) => !serverHasCheckIn(change, rows));
      if (unsent.length !== waiting.changes.length) {
        store({ ...waiting, changes: unsent }, scope);
        resetBodyMeasurementSyncBackoff();
      }
      const merged = overlay(rows, unsent);
      publish(merged);
      return merged;
    }
    return readLocal(scope);
  });
}

export async function listLocalBodyMeasurements(transport: BodyMeasurementTransport) {
  const scope = captureAccountCacheScope();
  const owner = check(scope);
  const local = await locked(async () => {
    const saved = await readOffline<BodyMeasurement[]>(CACHE_KEY, owner);
    check(scope);
    return saved || queue(owner).changes.length || navigator.onLine === false
      ? overlay(saved?.value ?? [], queue(owner).changes)
      : null;
  });
  if (local) {
    if (navigator.onLine !== false) void refreshBodyMeasurements(transport).catch(() => undefined);
    return local;
  }
  return refreshBodyMeasurements(transport);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === BODY_MEASUREMENT_QUEUE_KEY || event.key === null) ++revision;
  });
}

let syncing: Promise<void> | null = null;
/**
 * Sends waiting check-ins. `retry` is the person asking again: it also retries check-ins the
 * server refused. `immediate` is the app coming back to the foreground or online. Other calls
 * are automatic and wait out the pause that follows attempts the server did not answer.
 */
export function syncBodyMeasurements(
  transport: BodyMeasurementTransport,
  retry = false,
  immediate = false,
): Promise<void> {
  if (syncing) return syncing;
  if (!retry && !immediate && Date.now() < retryAfter) return Promise.resolve();
  const scope = captureAccountCacheScope();
  const run = async () => {
    const owner = check(scope);
    if (retry)
      await locked(async () => {
        const next = queue(owner);
        next.changes.forEach((item) => delete item.error);
        persist(next, scope);
      });
    while (scope.isCurrent() && navigator.onLine !== false) {
      const change = queue(owner).changes.find((item) => !item.error);
      if (!change) return;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        // A removal needs the check-in's id. After an attempt that got no answer, the server
        // may already hold this change, so ask before sending it again: a repeated save makes
        // the server redo its work, and a slow server then falls further behind.
        const rows =
          !change.payload || unanswered > 0 ? await transport.list(controller.signal) : null;
        if (rows) check(scope);
        const existing = rows?.find((item) => item.measurement_date === change.date) ?? null;
        let saved: BodyMeasurement | null = null;
        if (rows && serverHasCheckIn(change, rows)) saved = existing;
        else if (change.payload) saved = await transport.save(change.payload, controller.signal);
        else if (existing) await transport.remove(existing.id, controller.signal);
        await locked(async () => {
          check(scope);
          const rows = (await readOffline<BodyMeasurement[]>(CACHE_KEY, owner))?.value ?? [];
          const updated = rows.filter((item) => item.measurement_date !== change.date);
          if (saved) updated.push(saved);
          await writeOffline(CACHE_KEY, updated, owner, scope.isCurrent, true);
          const next = queue(owner);
          next.changes = next.changes.filter((item) => item.token !== change.token);
          persist(next, scope);
        });
        resetBodyMeasurementSyncBackoff();
      } catch (reason) {
        const status = (reason as { status?: number })?.status;
        if (
          scope.isCurrent() &&
          status &&
          status >= 400 &&
          status < 500 &&
          // 426: this release is too old to save; the updated app syncs the change instead.
          ![401, 408, 426, 429].includes(status)
        ) {
          await locked(async () => {
            const next = queue(owner);
            const current = next.changes.find((item) => item.token === change.token);
            if (current)
              current.error =
                reason instanceof Error ? reason.message : 'Could not sync this check-in.';
            persist(next, scope);
          });
        } else if (scope.isCurrent()) {
          // No usable answer. Leave a growing pause before the next automatic attempt.
          unanswered += 1;
          retryAfter = Date.now() + syncRetryDelay(unanswered);
        }
        throw reason;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
  syncing = (
    navigator.locks ? navigator.locks.request('relay-body-measurement-sync', run) : run()
  ).finally(() => {
    syncing = null;
  });
  return syncing;
}
