import { onlineManager } from '@tanstack/react-query';
import {
  BODY_MEASUREMENT_QUEUE_KEY,
  acknowledgedBodyMeasurements,
  bodyMeasurementDate,
  bodyMeasurementInputError,
  bodyMeasurementQueueBelongsElsewhere,
  bodyMeasurementQueueStatus,
  bodyMeasurementSendRefused,
  nextBodyMeasurementChange,
  overlayBodyMeasurements,
  parseBodyMeasurementQueue,
  withBodyMeasurementChange,
  withRefusedBodyMeasurementChange,
  withRetriedBodyMeasurementChanges,
  withoutBodyMeasurementChange,
  type BodyMeasurementChange,
  type BodyMeasurementInput,
  type BodyMeasurementQueue,
} from '../../../../frontend/src/bodyMeasurementQueue';
import type { BodyMeasurement } from '../../../../frontend/src/types';
import { ApiError, apiGet, apiSend } from '../../data/api';
import { deviceStorage, newId, readJson, writeJson } from '../../data/deviceStorage';

/**
 * Body check-ins saved on the phone first and sent afterwards, as the web's bodyMeasurementStore
 * does, so a weigh-in can be logged offline. The queue and its rules are the web's
 * (frontend/src/bodyMeasurementQueue.ts); a copy of the server's check-ins for the signed-in
 * account fills Body in until the server answers. Each change replaces any earlier one for its
 * day and the server keeps one check-in per day, so a change sent twice still saves once.
 */

const ROWS_KEY = 'relay.mobile.body-measurements.v1';
const PATH = '/api/body-measurements';

let owner: string | null = null;
/** Changes whenever the queue does, so an older list can't replace an acknowledged save. */
let revision = 0;
let syncing: Promise<number> | null = null;
/** Whether the latest send failed because Relay could not be reached, so the card offers Retry. */
let syncFailed = false;
const listeners = new Set<() => void>();
let status = { pending: 0, error: null as string | null };
/**
 * Sends the server acknowledged, by the revision they made, so a list that started earlier can
 * still show them before the phone has a copy of its own.
 */
let acknowledged: {
  revision: number;
  change: Pick<BodyMeasurementChange, 'date'>;
  saved: BodyMeasurement | null;
}[] = [];

function queueFor(account: string): BodyMeasurementQueue {
  try {
    return parseBodyMeasurementQueue(deviceStorage.getItem(BODY_MEASUREMENT_QUEUE_KEY), account);
  } catch {
    return { owner: account, changes: [] };
  }
}

function emit() {
  const next = bodyMeasurementQueueStatus(owner ? queueFor(owner) : { changes: [] });
  if (next.pending === 0) syncFailed = false;
  if (next.pending !== status.pending || next.error !== status.error) status = next;
  for (const listener of listeners) listener();
}

function persist(queue: BodyMeasurementQueue) {
  try {
    deviceStorage.setItem(BODY_MEASUREMENT_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    throw new Error('Could not save on this phone. Free some storage and try again.');
  }
  revision += 1;
  emit();
}

function savedRows(account: string): BodyMeasurement[] | null {
  const copy = readJson<{ owner: string; rows: BodyMeasurement[] }>(ROWS_KEY);
  return copy?.owner === account && Array.isArray(copy.rows) ? copy.rows : null;
}

function signedInOwner(): string {
  if (!owner) throw new Error('Sign in to log a check-in.');
  return owner;
}

/** Starts or ends the signed-in account's queue; another account's queue and copy are dropped. */
export function setBodyCheckInOwner(account: string | null) {
  if (account !== owner) {
    acknowledged = [];
    syncFailed = false;
  }
  owner = account;
  if (account) {
    if (
      bodyMeasurementQueueBelongsElsewhere(
        deviceStorage.getItem(BODY_MEASUREMENT_QUEUE_KEY),
        account,
      )
    )
      deviceStorage.removeItem(BODY_MEASUREMENT_QUEUE_KEY);
    if (readJson<{ owner: string }>(ROWS_KEY)?.owner !== account) writeJson(ROWS_KEY, null);
  }
  emit();
}

/**
 * Removes the copy of the server's check-ins, as when signing out. Changes still waiting stay,
 * so they send when the same account signs in again.
 */
export function forgetBodyCheckInCopy() {
  writeJson(ROWS_KEY, null);
}

export function subscribeBodyCheckIns(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether a signed-in account's queue is running (BodyCheckInSync starts it). */
export const bodyCheckInQueueActive = () => owner !== null;

/** How many check-ins wait on the phone, and why the server refused one. */
export const bodyCheckInStatus = () => status;

/** Whether the last sync attempt failed with a connection or server error (not a refusal). */
export const bodyCheckInSyncFailed = () => syncFailed;

/** Whether a sync attempt is currently running. */
export const bodyCheckInSyncing = () => syncing !== null;

/** Whether any queued check-in is sendable automatically (excludes refused changes waiting on Retry). */
export const bodyCheckInHasSendable = () =>
  owner !== null && nextBodyMeasurementChange(queueFor(owner)) !== null;

/**
 * The account the phone's copy belongs to. Signing out removes the copy, so before the session
 * has started this is the account opening the app.
 */
const copyOwner = () => readJson<{ owner?: unknown }>(ROWS_KEY)?.owner;

/** The check-ins as the phone knows them, newest first, or null before any have loaded. */
export function localBodyMeasurements(
  account = owner ?? (typeof copyOwner() === 'string' ? (copyOwner() as string) : null),
): BodyMeasurement[] | null {
  if (!account) return null;
  const rows = savedRows(account);
  const { changes } = queueFor(account);
  return rows || changes.length ? overlayBodyMeasurements(rows ?? [], changes) : null;
}

/** The server's check-ins with the waiting changes applied, keeping a copy for offline use. */
export async function fetchBodyMeasurements(signal?: AbortSignal): Promise<BodyMeasurement[]> {
  // The account and revision the list is for, taken before it is asked for.
  const account = owner;
  const started = revision;
  const rows = await apiGet<BodyMeasurement[]>(PATH, signal);
  if (owner !== account) {
    // Another account signed in meanwhile: this list is not theirs, so ask again for theirs.
    if (!owner) throw new Error('The signed-in account changed.');
    return fetchBodyMeasurements(signal);
  }
  if (!account) return rows;
  let base = rows;
  if (started === revision) writeJson(ROWS_KEY, { owner: account, rows });
  else {
    // A list that started before a local save or a send must not replace its acknowledged
    // result: use the copy, or (before there is one) this list with what was sent since.
    base =
      savedRows(account) ??
      acknowledged
        .filter((item) => item.revision > started)
        .reduce((list, item) => acknowledgedBodyMeasurements(list, item.change, item.saved), rows);
    writeJson(ROWS_KEY, { owner: account, rows: base });
  }
  return overlayBodyMeasurements(base, queueFor(account).changes);
}

/** Saves a check-in on the phone and starts sending it. */
export function saveBodyCheckIn(payload: BodyMeasurementInput): BodyMeasurement {
  const invalid = bodyMeasurementInputError(payload);
  if (invalid) throw new Error(invalid);
  const account = signedInOwner();
  const row = localBodyMeasurements(account)?.find(
    (item) => item.measurement_date === payload.measurement_date,
  );
  const queue = withBodyMeasurementChange(queueFor(account), {
    token: newId(),
    date: payload.measurement_date,
    createdAt: row?.created_at ?? new Date().toISOString(),
    payload,
  });
  persist(queue);
  void syncBodyCheckIns().catch(() => undefined);
  return overlayBodyMeasurements(row ? [row] : [], queue.changes).find(
    (item) => item.measurement_date === payload.measurement_date,
  )!;
}

/** Deletes a check-in on the phone and starts sending the deletion. */
export function deleteBodyCheckIn(id: string) {
  const account = signedInOwner();
  const date = bodyMeasurementDate(id, localBodyMeasurements(account) ?? []);
  if (!date) throw new Error('This check-in no longer exists. Refresh before trying again.');
  persist(
    withBodyMeasurementChange(queueFor(account), {
      token: newId(),
      date,
      createdAt: new Date().toISOString(),
      payload: null,
    }),
  );
  void syncBodyCheckIns().catch(() => undefined);
}

/**
 * Sends the waiting changes one at a time, oldest first, while online. A refused change waits
 * for `retry` without blocking the others; a connection failure stops until the next attempt.
 * Resolves with how many changes the server acknowledged.
 */
export function syncBodyCheckIns(retry = false): Promise<number> {
  // A run already going may have stopped looking (offline, or past the change just saved), so
  // another starts once it ends.
  if (syncing) return syncing.catch(() => 0).then(() => syncing ?? syncBodyCheckIns(retry));
  const account = owner;
  if (!account) return Promise.resolve(0);
  const run = async () => {
    let sent = 0;
    if (retry) persist(withRetriedBodyMeasurementChanges(queueFor(account)));
    while (owner === account && onlineManager.isOnline()) {
      const change = nextBodyMeasurementChange(queueFor(account));
      if (!change) break;
      try {
        let saved: BodyMeasurement | null = null;
        if (change.payload) saved = await apiSend<BodyMeasurement>(PATH, 'POST', change.payload);
        else {
          const rows = await apiGet<BodyMeasurement[]>(PATH);
          const existing = rows.find((item) => item.measurement_date === change.date);
          if (existing) await apiSend<void>(`${PATH}/${encodeURIComponent(existing.id)}`, 'DELETE');
        }
        if (owner !== account) break;
        const rows = savedRows(account);
        if (rows)
          writeJson(ROWS_KEY, {
            owner: account,
            rows: acknowledgedBodyMeasurements(rows, change, saved),
          });
        syncFailed = false;
        persist(withoutBodyMeasurementChange(queueFor(account), change.token));
        acknowledged = [...acknowledged.slice(-49), { revision, change, saved }];
        sent += 1;
      } catch (reason) {
        const code = reason instanceof ApiError ? reason.status : undefined;
        if (owner !== account || !bodyMeasurementSendRefused(code)) {
          if (owner === account) {
            syncFailed = true;
            emit();
          }
          throw reason;
        }
        syncFailed = false;
        persist(
          withRefusedBodyMeasurementChange(
            queueFor(account),
            change.token,
            reason instanceof Error ? reason.message : 'Could not sync this check-in.',
          ),
        );
      }
    }
    return sent;
  };
  syncing = run().finally(() => {
    syncing = null;
  });
  return syncing;
}
