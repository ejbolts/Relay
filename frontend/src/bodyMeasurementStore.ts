import { captureAccountCacheScope, type AccountCacheScope } from './accountCacheScope';
import { browserAccountStorage, type AccountStorage } from './deviceAccount';
import { readOffline, writeOffline } from './offlineStore';
import {
  BODY_MEASUREMENT_QUEUE_KEY,
  acknowledgedBodyMeasurements,
  bodyMeasurementDate,
  bodyMeasurementInputError,
  bodyMeasurementQueueBelongsElsewhere,
  bodyMeasurementQueueStatus,
  bodyMeasurementSendRefused,
  nextBodyMeasurementChange,
  overlayBodyMeasurements as overlay,
  parseBodyMeasurementQueue,
  withBodyMeasurementChange,
  withRefusedBodyMeasurementChange,
  withRetriedBodyMeasurementChanges,
  withoutBodyMeasurementChange,
  type BodyMeasurementInput,
  type BodyMeasurementQueue as Queue,
} from './bodyMeasurementQueue';
import type { BodyMeasurement } from './types';

export { BODY_MEASUREMENT_QUEUE_KEY, type BodyMeasurementInput };

// Like finished workout drafts, only unsynced changes are kept in localStorage for recovery
// after session expiry. Server history stays in the encrypted IndexedDB cache.
export const BODY_MEASUREMENTS_CHANGED = 'relay-body-measurements-changed';
const CACHE_KEY = 'response:/api/body-measurements';
export interface BodyMeasurementTransport {
  list(signal?: AbortSignal): Promise<BodyMeasurement[]>;
  save(payload: BodyMeasurementInput, signal: AbortSignal): Promise<BodyMeasurement>;
  remove(id: string, signal: AbortSignal): Promise<void>;
}

let serial: Promise<unknown> = Promise.resolve();
let revision = 0;
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
  return parseBodyMeasurementQueue(storage?.getItem(BODY_MEASUREMENT_QUEUE_KEY) ?? null, owner);
}
function publish(rows?: BodyMeasurement[]) {
  ++revision;
  window.dispatchEvent(new CustomEvent(BODY_MEASUREMENTS_CHANGED, { detail: rows }));
}
function persist(next: Queue, scope: AccountCacheScope) {
  check(scope);
  const storage = browserAccountStorage();
  if (!storage)
    throw new Error('Could not save on this device. Keep this check-in open and try again.');
  try {
    storage.setItem(BODY_MEASUREMENT_QUEUE_KEY, JSON.stringify(next));
  } catch {
    throw new Error('Could not save on this device. Free some storage and try again.');
  }
  publish();
}

export function clearBodyMeasurementQueue(
  storage: AccountStorage | null = browserAccountStorage(),
) {
  storage?.removeItem(BODY_MEASUREMENT_QUEUE_KEY);
}
export function reconcileBodyMeasurementQueue(owner: string, storage: AccountStorage | null) {
  if (
    bodyMeasurementQueueBelongsElsewhere(
      storage?.getItem(BODY_MEASUREMENT_QUEUE_KEY) ?? null,
      owner,
    )
  )
    clearBodyMeasurementQueue(storage);
}
export function bodyMeasurementSyncStatus() {
  const scope = captureAccountCacheScope();
  return bodyMeasurementQueueStatus(scope.owner ? queue(scope.owner) : { changes: [] });
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
  const invalid = bodyMeasurementInputError(payload);
  if (invalid) throw new Error(invalid);
  const scope = captureAccountCacheScope();
  return locked(async () => {
    const owner = check(scope);
    const row = (await readLocal(scope)).find(
      (item) => item.measurement_date === payload.measurement_date,
    );
    const next = withBodyMeasurementChange(queue(owner), {
      token: crypto.randomUUID(),
      date: payload.measurement_date,
      createdAt: row?.created_at ?? new Date().toISOString(),
      payload,
    });
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
    const date = bodyMeasurementDate(id, await readLocal(scope));
    if (!date) throw new Error('This check-in no longer exists. Refresh before trying again.');
    const next = withBodyMeasurementChange(queue(owner), {
      token: crypto.randomUUID(),
      date,
      createdAt: new Date().toISOString(),
      payload: null,
    });
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
      const merged = overlay(rows, queue(owner).changes);
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
export function syncBodyMeasurements(
  transport: BodyMeasurementTransport,
  retry = false,
): Promise<void> {
  if (syncing) return syncing;
  const scope = captureAccountCacheScope();
  const run = async () => {
    const owner = check(scope);
    if (retry)
      await locked(async () => {
        persist(withRetriedBodyMeasurementChanges(queue(owner)), scope);
      });
    while (scope.isCurrent() && navigator.onLine !== false) {
      const change = nextBodyMeasurementChange(queue(owner));
      if (!change) return;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        let saved: BodyMeasurement | null = null;
        if (change.payload) saved = await transport.save(change.payload, controller.signal);
        else {
          const rows = await transport.list(controller.signal);
          check(scope);
          const existing = rows.find((item) => item.measurement_date === change.date);
          if (existing) await transport.remove(existing.id, controller.signal);
        }
        await locked(async () => {
          check(scope);
          const rows = (await readOffline<BodyMeasurement[]>(CACHE_KEY, owner))?.value ?? [];
          const updated = acknowledgedBodyMeasurements(rows, change, saved);
          await writeOffline(CACHE_KEY, updated, owner, scope.isCurrent, true);
          persist(withoutBodyMeasurementChange(queue(owner), change.token), scope);
        });
      } catch (reason) {
        const status = (reason as { status?: number })?.status;
        // 426: this release is too old to save; the updated app syncs the change instead.
        if (scope.isCurrent() && bodyMeasurementSendRefused(status)) {
          await locked(async () => {
            const message =
              reason instanceof Error ? reason.message : 'Could not sync this check-in.';
            persist(withRefusedBodyMeasurementChange(queue(owner), change.token, message), scope);
          });
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
