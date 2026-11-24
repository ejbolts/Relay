import { NUDGE_MIN_VISIBLE_MS } from './tipScheduling';
import { parseTips, withTipReminders, type TipState } from './tipsState';

/**
 * Tips follow the account: each client keeps its own copy (the source while offline) and merges
 * it with the account's copy on the server, at /api/tips. The server merges every save with what
 * it holds by the same rules (backend/app/tip_state.py, checked against tipSyncCases.json), so
 * two devices can never erase each other's progress:
 *
 * - dismissed and learned are sticky, as is seen: the strongest status wins;
 * - showings, event counts and the last showing take the larger value;
 * - Home's read and put-away lists are combined;
 * - Show tips is the most recent choice (`enabledAt`); on a tie, off wins;
 * - a guided tip's reminder count is its generation: a tip that came back on one device (a higher
 *   count) replaces the older generation's status, showings and Home lists, except learned;
 * - tip ids and fields this client doesn't know are kept, for older and newer clients.
 */

/** Tips as stored on the server or sent to it; ids may include ones this client doesn't know. */
export type SyncedTips = Record<string, unknown>;

/** How long after a local change the client saves to the server. */
export const TIP_SYNC_DEBOUNCE_MS = 5000;
/** Returning to the app or tab fetches the account's tips at most this often. */
export const TIP_SYNC_REFRESH_MS = 30_000;
/** The largest tip state the server stores, in bytes of JSON. */
export const TIP_SYNC_MAX_BYTES = 32 * 1024;

const KNOWN_FIELDS = new Set([
  'enabled',
  'enabledAt',
  'lastShown',
  'seen',
  'counts',
  'shows',
  'homeRead',
  'homeDone',
  'reminders',
]);
/** Sync bookkeeping, never merged or stored with the tips: the server's generation and ours. */
const IGNORED_FIELDS = new Set(['generation', 'syncGeneration']);
const RANK = new Map([
  ['seen', 1],
  ['dismissed', 2],
  ['learned', 3],
]);
const rank = (status: string | undefined) => (status === undefined ? 0 : (RANK.get(status) ?? 0));

type Reminder = { count: number; at?: number };
// Maps, not objects: tip ids and event names arrive from other clients, and a name such as
// "constructor" or "__proto__" must be an ordinary key, never an inherited property.
type Clean = {
  enabled: boolean;
  enabledAt: number;
  lastShown: number;
  seen: Map<string, string>;
  counts: Map<string, number>;
  shows: Map<string, number>;
  homeRead: string[];
  homeDone: string[];
  reminders: Map<string, Reminder>;
  extra: [string, unknown][];
};

/** A JSON object's own entries; anything else has none. */
const entries = (value: unknown): [string, unknown][] =>
  value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [];
/** One own field of a JSON object. */
const field = (value: unknown, key: string): unknown =>
  value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;
const amount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
const amounts = (value: unknown) =>
  new Map(
    entries(value).flatMap(([key, count]): [string, number][] => {
      const valid = amount(count);
      return valid === undefined ? [] : [[key, valid]];
    }),
  );
const ids = (value: unknown) =>
  Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === 'string'))] : [];

function clean(value: unknown): Clean {
  const reminders = new Map<string, Reminder>();
  for (const [id, reminder] of entries(field(value, 'reminders'))) {
    const count = field(reminder, 'count');
    const at = field(reminder, 'at');
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) continue;
    reminders.set(id, typeof at === 'number' && Number.isFinite(at) ? { count, at } : { count });
  }
  return {
    enabled: field(value, 'enabled') !== false,
    enabledAt: amount(field(value, 'enabledAt')) ?? 0,
    lastShown: amount(field(value, 'lastShown')) ?? 0,
    seen: new Map(
      entries(field(value, 'seen')).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && RANK.has(entry[1]),
      ),
    ),
    counts: amounts(field(value, 'counts')),
    shows: amounts(field(value, 'shows')),
    homeRead: ids(field(value, 'homeRead')),
    homeDone: ids(field(value, 'homeDone')),
    reminders,
    extra: entries(value).filter(([key]) => !KNOWN_FIELDS.has(key) && !IGNORED_FIELDS.has(key)),
  };
}

const larger = (a: number | undefined, b: number | undefined) =>
  a === undefined ? b : b === undefined ? a : Math.max(a, b);

/**
 * Merges two copies of an account's tips: the stored one and an incoming one (whose unknown
 * top-level fields win). The result keeps every tip id from both, known to this client or not.
 */
export function mergeTipStates(stored: unknown, incoming: unknown): SyncedTips {
  const a = clean(stored);
  const b = clean(incoming);
  const seen: [string, string][] = [];
  const shows: [string, number][] = [];
  const reminders: [string, Reminder][] = [];
  const read = new Set<string>();
  const done = new Set<string>();
  const tipIds = new Set(
    [a, b].flatMap((side) => [
      ...side.seen.keys(),
      ...side.shows.keys(),
      ...side.reminders.keys(),
      ...side.homeRead,
      ...side.homeDone,
    ]),
  );
  for (const id of tipIds) {
    const generationA = a.reminders.get(id)?.count ?? 0;
    const generationB = b.reminders.get(id)?.count ?? 0;
    let status: string | undefined;
    let showings: number | undefined;
    let reminder: Reminder | undefined;
    if (generationA !== generationB) {
      // The tip came back on one side: its newer generation replaces the older one's progress.
      const [newer, older] = generationA > generationB ? [a, b] : [b, a];
      status = older.seen.get(id) === 'learned' ? 'learned' : newer.seen.get(id);
      showings = newer.shows.get(id);
      reminder = newer.reminders.get(id);
      if (newer.homeRead.includes(id)) read.add(id);
      if (newer.homeDone.includes(id)) done.add(id);
    } else {
      const statusA = a.seen.get(id);
      const statusB = b.seen.get(id);
      status = rank(statusA) >= rank(statusB) ? (statusA ?? statusB) : statusB;
      showings = larger(a.shows.get(id), b.shows.get(id));
      const reminderA = a.reminders.get(id);
      const reminderB = b.reminders.get(id);
      if (reminderA || reminderB) {
        const at =
          reminderA?.at === undefined
            ? reminderB?.at
            : reminderB?.at === undefined
              ? reminderA.at
              : Math.min(reminderA.at, reminderB.at);
        reminder = at === undefined ? { count: generationA } : { count: generationA, at };
      }
      if (a.homeRead.includes(id) || b.homeRead.includes(id)) read.add(id);
      if (a.homeDone.includes(id) || b.homeDone.includes(id)) done.add(id);
    }
    if (status) seen.push([id, status]);
    if (showings !== undefined) shows.push([id, showings]);
    if (reminder) reminders.push([id, reminder]);
  }
  const counts = new Map(a.counts);
  for (const [event, count] of b.counts) counts.set(event, larger(counts.get(event), count)!);
  const enabled =
    a.enabledAt === b.enabledAt
      ? a.enabled && b.enabled
      : a.enabledAt > b.enabledAt
        ? a.enabled
        : b.enabled;
  const enabledAt = Math.max(a.enabledAt, b.enabledAt);
  // Lists keep the stored order, then add what only the incoming copy had.
  const ordered = (set: Set<string>, first: string[], second: string[]) =>
    [...new Set([...first, ...second])].filter((id) => set.has(id));
  const homeRead = ordered(read, a.homeRead, b.homeRead);
  const homeDone = ordered(done, a.homeDone, b.homeDone);
  // Object.fromEntries defines every key as an own property, "__proto__" included.
  const extra = new Map([...a.extra, ...b.extra]);
  return Object.fromEntries([
    ...extra,
    ['enabled', enabled],
    ...(enabledAt ? [['enabledAt', enabledAt]] : []),
    ['lastShown', Math.max(a.lastShown, b.lastShown)],
    ['seen', Object.fromEntries(seen)],
    ['counts', Object.fromEntries(counts)],
    ['shows', Object.fromEntries(shows)],
    ...(homeRead.length ? [['homeRead', homeRead]] : []),
    ...(homeDone.length ? [['homeDone', homeDone]] : []),
    ...(reminders.length ? [['reminders', Object.fromEntries(reminders)]] : []),
  ]);
}

/**
 * This client's tips after merging the server's copy into them: ids this client doesn't know are
 * left on the server, and any reminder the merge makes due comes back.
 */
export function mergeServerTips(local: TipState, server: unknown, now: number): TipState {
  return withTipReminders(parseTips(JSON.stringify(mergeTipStates(local, server))), now);
}

/** Whether two copies hold the same tips, whatever order their fields were written in. */
export function sameTips(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
          )
        : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/**
 * While a nudge could still be put back by an early interruption (tipScheduling's
 * `interruptedNudge`), its showing stays on this device: saving it would let the server's larger
 * showing count and last showing undo the rollback.
 */
export const tipSyncHoldUntil = (shownAt: number) => shownAt + NUDGE_MIN_VISIBLE_MS + 1000;

/**
 * The generation of an account's tips that no archive restore has replaced. A client with no
 * recorded generation sends this one, so after a restore it adopts the restored tips too.
 */
export const INITIAL_TIP_GENERATION = '0';

/**
 * This client's tips after the server's reply, which carries the server's `generation`:
 * - the copy's generation: the reply merges into the tips;
 * - a later generation than the copy sent (the account was restored from an archive): the reply
 *   replaces the tips;
 * - null when the copy has meanwhile moved to another generation than both (another tab adopted
 *   a restore while this reply was on its way): the reply is stale, and the caller syncs again.
 * Either way the tips record the reply's generation.
 */
export function tipsAfterReply(
  local: TipState,
  reply: unknown,
  sentGeneration: string,
  now: number,
): TipState | null {
  const generation =
    reply && typeof reply === 'object' && Object.hasOwn(reply, 'generation')
      ? (reply as { generation?: unknown }).generation
      : undefined;
  if (typeof generation !== 'string') return mergeServerTips(local, reply, now);
  const localGeneration = local.syncGeneration ?? INITIAL_TIP_GENERATION;
  if (localGeneration !== generation && localGeneration !== sentGeneration) return null;
  const next =
    localGeneration === generation
      ? mergeServerTips(local, reply, now)
      : withTipReminders(parseTips(JSON.stringify(reply)), now);
  return { ...next, syncGeneration: generation };
}

/** A transport's answer when the server refused tips held for another account (a stale tab). */
export const TIP_SYNC_REFUSED = Symbol('tip sync refused');

/** A transport's error when the server was busy and asked to be tried again shortly. */
export class TipSyncBusy extends Error {
  constructor() {
    super('The tip store is busy.');
  }
}

/** Waits before each retry of a busy server, and of a stale reply; then the next return retries. */
const RETRY_MS = [2000, 5000, 15_000];

export interface TipSyncOptions {
  /**
   * This device's latest saved tips. Read afresh for every request and reply, so a reply merges
   * into what another tab saved meanwhile rather than into an older copy.
   */
  read: () => TipState;
  /** Saves merged tips on this device, without asking for another sync. */
  write: (state: TipState) => void;
  /**
   * Saves the tips to the server, with the generation this copy last synced, and resolves with:
   * - its reply;
   * - `null` when the server has no tip store (an older Relay), which stops syncing for the
   *   session;
   * - `TIP_SYNC_REFUSED` when it refused tips for another account: changes stay on this device
   *   until a sync asked for now (sign-in, returning to the app or tab) is accepted again.
   * It throws `TipSyncBusy` for a busy server, which is retried a few times.
   */
  send: (state: TipState, generation: string) => Promise<unknown | null | typeof TIP_SYNC_REFUSED>;
  /** False once the account or session has changed, so a late reply is dropped. */
  current: () => boolean;
  /** A hold other copies of the app on this device have placed (another tab's nudge). */
  sharedHold?: () => number;
  now?: () => number;
}

/**
 * Keeps one account's tips in step with the server: `changed()` after a local change (saved once
 * changes pause for TIP_SYNC_DEBOUNCE_MS), `refresh()` on returning to the app or tab,
 * `syncNow()` on sign-in, and `hold()` while a nudge's showing may still be undone. One request
 * runs at a time; failures leave the local tips as they are, for the next attempt.
 */
export function createTipSync({
  read,
  write,
  send,
  current,
  sharedHold,
  now = Date.now,
}: TipSyncOptions) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let due = 0;
  /** The pending timer is a sync asked for now (sign-in, return or a hold ending), not a pause. */
  let soon = false;
  let running = false;
  /** While a request was out: a sync was asked for now, or a change waits for its pause. */
  let askedMeanwhile = false;
  let changedMeanwhile = false;
  let dirty = false;
  let stopped = false;
  let unsupported = false;
  /** The server refused this copy's account; only a sync asked for now tries again. */
  let refused = false;
  let retries = 0;
  let holdUntil = 0;
  let lastSynced = 0;

  function arm(at: number, asked: boolean) {
    if (stopped || unsupported) return;
    if (timer !== undefined) clearTimeout(timer);
    due = at;
    soon = asked;
    timer = setTimeout(
      () => {
        timer = undefined;
        void run();
      },
      Math.max(0, at - now()),
    );
  }

  function syncSoon() {
    // Asked for while a request is out: it runs as soon as that request's reply is in, even
    // when the reply is a refusal, since the account may be back by now.
    if (running) {
      askedMeanwhile = true;
      return;
    }
    if (timer !== undefined && soon && due <= now()) return;
    arm(now(), true);
  }

  async function run() {
    if (stopped || unsupported) return;
    if (running) {
      if (soon) askedMeanwhile = true;
      else changedMeanwhile = true;
      return;
    }
    // Read the tips before the hold: a tab that shows a nudge places its hold before saving the
    // showing, so tips that include it are always seen with the hold.
    const { syncGeneration, ...tips } = read();
    const held = Math.max(holdUntil, sharedHold?.() ?? 0);
    if (now() < held) {
      arm(held, true);
      return;
    }
    running = true;
    dirty = false;
    let retryAt: number | undefined;
    try {
      const sent = syncGeneration ?? INITIAL_TIP_GENERATION;
      const reply = await send(tips, sent);
      if (stopped || !current()) return;
      if (reply === null) {
        unsupported = true;
        return;
      }
      if (reply === TIP_SYNC_REFUSED) {
        refused = true;
        dirty = true;
        return;
      }
      refused = false;
      lastSynced = now();
      const local = read();
      const next = tipsAfterReply(local, reply, sent, now());
      if (next === null) {
        // Another tab moved to a newer generation meanwhile: sync again from that one.
        dirty = true;
        if (retries < RETRY_MS.length) retryAt = now();
        retries += 1;
        return;
      }
      retries = 0;
      if (!sameTips(next, local)) write(next);
    } catch (error) {
      // Offline or refused: this device's tips stand, and the next change or return retries.
      dirty = true;
      if (error instanceof TipSyncBusy && retries < RETRY_MS.length)
        retryAt = now() + RETRY_MS[retries];
      if (error instanceof TipSyncBusy) retries += 1;
    } finally {
      running = false;
      const asked = askedMeanwhile;
      // A refusal cancels the save a change was waiting to make; it stays on this device.
      const pause = changedMeanwhile && !refused ? now() + TIP_SYNC_DEBOUNCE_MS : undefined;
      askedMeanwhile = changedMeanwhile = false;
      if (asked) arm(now(), true);
      else if (retryAt !== undefined && (pause === undefined || retryAt <= pause))
        arm(retryAt, true);
      else if (pause !== undefined) arm(pause, false);
    }
  }

  function askNow() {
    retries = 0;
    syncSoon();
  }

  return {
    /** A local change: saved to the server once changes pause. Each change restarts the pause. */
    changed() {
      dirty = true;
      // Refused for another account: kept here until a sync asked for now is accepted.
      if (refused) return;
      // A sync already asked for will carry this change.
      if (timer !== undefined && soon) return;
      // While a request is out, the pause starts once its reply is in (and a refusal cancels it).
      if (running) {
        changedMeanwhile = true;
        return;
      }
      arm(now() + TIP_SYNC_DEBOUNCE_MS, false);
    },
    /** Sign-in: fetch and merge now. */
    syncNow: askNow,
    /** Back in the app or tab: fetch now, unless it was fetched moments ago with nothing new. */
    refresh() {
      if (dirty || now() - lastSynced >= TIP_SYNC_REFRESH_MS) askNow();
    },
    /** Keeps this device's tips off the server until `until` (a nudge's rollback window). */
    hold(until: number) {
      holdUntil = Math.max(holdUntil, until);
    },
    /** The account or session ended: nothing more is sent, and a late reply is dropped. */
    stop() {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}

export type TipSync = ReturnType<typeof createTipSync>;

/**
 * Where a client saves its tips: it names the account they belong to, which the server checks
 * against the signed-in one, and the generation this copy last synced.
 */
export function tipSyncPath(account: string, generation: string | undefined): string {
  const query = new URLSearchParams({ account });
  if (generation !== undefined) query.set('generation', generation);
  return `/api/tips?${query}`;
}

/** The server's refusal of tips held for an account other than the signed-in one. */
export const TIP_ACCOUNT_MISMATCH = 'tip_account_mismatch';
