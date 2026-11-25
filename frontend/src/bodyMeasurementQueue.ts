import type { BodyMeasurement } from './types';

// The rules of the check-in queue kept on a device, shared by the web's bodyMeasurementStore
// (localStorage) and the app's (the phone's key-value store). A check-in is saved on the device
// first and sent afterwards, so it can be logged offline; each change replaces any earlier one
// for its day, and the server keeps one check-in per day, so a change sent twice saves once.

export type BodyMeasurementInput = Pick<
  BodyMeasurement,
  'measurement_date' | 'weight_kg' | 'body_fat_pct' | 'notes'
>;

/** Where both apps keep the queue, under the same key. */
export const BODY_MEASUREMENT_QUEUE_KEY = 'relay-body-measurement-queue';

/** The id a check-in has until the server saves it. */
export const LOCAL_BODY_MEASUREMENT_ID = 'local-body:';

/** One waiting change for a day: a check-in to save, or (payload null) one to delete. */
export interface BodyMeasurementChange {
  token: string;
  date: string;
  createdAt: string;
  payload: BodyMeasurementInput | null;
  /** Why the server refused it; it waits for a retry instead of blocking the others. */
  error?: string;
}

export interface BodyMeasurementQueue {
  owner: string;
  changes: BodyMeasurementChange[];
}

/**
 * The queue stored for `owner`, empty when nothing is stored or it belongs to another account.
 * Throws when what is stored can't be read.
 */
export function parseBodyMeasurementQueue(raw: string | null, owner: string): BodyMeasurementQueue {
  if (!raw) return { owner, changes: [] };
  const saved = JSON.parse(raw) as BodyMeasurementQueue;
  if (!saved || !Array.isArray(saved.changes)) throw new Error('Could not read saved check-ins.');
  return saved.owner === owner ? saved : { owner, changes: [] };
}

/** Whether a stored queue belongs to another account, so signing in as `owner` drops it. */
export function bodyMeasurementQueueBelongsElsewhere(raw: string | null, owner: string) {
  return !!raw && (JSON.parse(raw) as BodyMeasurementQueue).owner !== owner;
}

/** The server's check-ins with the waiting changes applied, newest first. */
export function overlayBodyMeasurements(
  rows: BodyMeasurement[],
  changes: BodyMeasurementChange[],
): BodyMeasurement[] {
  const byDate = new Map(rows.map((row) => [row.measurement_date, row]));
  for (const change of changes) {
    if (change.payload) {
      const previous = byDate.get(change.date);
      byDate.set(change.date, {
        id: previous?.id ?? `${LOCAL_BODY_MEASUREMENT_ID}${change.date}`,
        created_at: previous?.created_at ?? change.createdAt,
        is_sample: false,
        ...change.payload,
      });
    } else byDate.delete(change.date);
  }
  return [...byDate.values()].sort((a, b) => b.measurement_date.localeCompare(a.measurement_date));
}

/** Why a check-in can't be saved, or null when it can. */
export function bodyMeasurementInputError(payload: BodyMeasurementInput): string | null {
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(payload.measurement_date) &&
    Number.isFinite(Date.parse(`${payload.measurement_date}T00:00:00Z`)) &&
    new Date(`${payload.measurement_date}T00:00:00Z`).toISOString().slice(0, 10) ===
      payload.measurement_date &&
    Number.isFinite(payload.weight_kg) &&
    payload.weight_kg > 0 &&
    payload.weight_kg <= 500 &&
    (payload.body_fat_pct === null ||
      (Number.isFinite(payload.body_fat_pct) &&
        payload.body_fat_pct >= 1 &&
        payload.body_fat_pct <= 70)) &&
    (payload.notes?.length ?? 0) <= 2000;
  return valid
    ? null
    : 'Enter a valid date, body weight and body-fat percentage. Notes can contain up to 2,000 characters.';
}

/** The queue with `change` replacing any waiting change for its day. */
export function withBodyMeasurementChange(
  queue: BodyMeasurementQueue,
  change: BodyMeasurementChange,
): BodyMeasurementQueue {
  return {
    ...queue,
    changes: [...queue.changes.filter((item) => item.date !== change.date), change],
  };
}

/** The day a check-in id belongs to, from the local id or the check-ins shown. */
export function bodyMeasurementDate(id: string, rows: BodyMeasurement[]): string | null {
  if (id.startsWith(LOCAL_BODY_MEASUREMENT_ID)) return id.slice(LOCAL_BODY_MEASUREMENT_ID.length);
  return rows.find((item) => item.id === id)?.measurement_date ?? null;
}

/** The oldest change still to send: refused ones wait for a retry. */
export function nextBodyMeasurementChange(queue: BodyMeasurementQueue) {
  return queue.changes.find((item) => !item.error) ?? null;
}

/** The server's check-ins after it acknowledged `change` (`saved` for a save). */
export function acknowledgedBodyMeasurements(
  rows: BodyMeasurement[],
  change: Pick<BodyMeasurementChange, 'date'>,
  saved: BodyMeasurement | null,
): BodyMeasurement[] {
  const updated = rows.filter((item) => item.measurement_date !== change.date);
  if (saved) updated.push(saved);
  return updated;
}

/** The queue without an acknowledged change; a newer change for the same day stays. */
export function withoutBodyMeasurementChange(
  queue: BodyMeasurementQueue,
  token: string,
): BodyMeasurementQueue {
  return { ...queue, changes: queue.changes.filter((item) => item.token !== token) };
}

/**
 * Whether a failed send means the server refused the change, which then waits for a retry.
 * Connection failures, sign-in expiry (401), timeouts (408), rate limits (429) and an app too
 * old to save (426, where the updated app sends it instead) keep it waiting to send.
 */
export function bodyMeasurementSendRefused(status: number | undefined): boolean {
  return !!status && status >= 400 && status < 500 && ![401, 408, 426, 429].includes(status);
}

/** The queue with `token`'s change marked refused for `message`. */
export function withRefusedBodyMeasurementChange(
  queue: BodyMeasurementQueue,
  token: string,
  message: string,
): BodyMeasurementQueue {
  return {
    ...queue,
    changes: queue.changes.map((item) =>
      item.token === token ? { ...item, error: message } : item,
    ),
  };
}

/** The queue with every refusal cleared, so a retry sends them again. */
export function withRetriedBodyMeasurementChanges(
  queue: BodyMeasurementQueue,
): BodyMeasurementQueue {
  return {
    ...queue,
    changes: queue.changes.map((item) => {
      const retried = { ...item };
      delete retried.error;
      return retried;
    }),
  };
}

/** How many changes wait, and the first refusal. */
export function bodyMeasurementQueueStatus(queue: Pick<BodyMeasurementQueue, 'changes'>) {
  return {
    pending: queue.changes.length,
    error: queue.changes.find((item) => item.error)?.error ?? null,
  };
}
