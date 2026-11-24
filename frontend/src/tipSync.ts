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
const RANK: Record<string, number> = { seen: 1, dismissed: 2, learned: 3 };

type Reminder = { count: number; at?: number };
type Clean = {
  enabled: boolean;
  enabledAt: number;
  lastShown: number;
  seen: Record<string, string>;
  counts: Record<string, number>;
  shows: Record<string, number>;
  homeRead: string[];
  homeDone: string[];
  reminders: Record<string, Reminder>;
  extra: Record<string, unknown>;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const amount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
const amounts = (value: unknown) =>
  Object.fromEntries(
    Object.entries(record(value)).flatMap(([key, count]) => {
      const valid = amount(count);
      return valid === undefined ? [] : [[key, valid]];
    }),
  ) as Record<string, number>;
const ids = (value: unknown) =>
  Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === 'string'))] : [];

function clean(value: unknown): Clean {
  const raw = record(value);
  const reminders: Record<string, Reminder> = {};
  for (const [id, reminder] of Object.entries(record(raw.reminders))) {
    const { count, at } = record(reminder);
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) continue;
    reminders[id] = typeof at === 'number' && Number.isFinite(at) ? { count, at } : { count };
  }
  return {
    enabled: raw.enabled !== false,
    enabledAt: amount(raw.enabledAt) ?? 0,
    lastShown: amount(raw.lastShown) ?? 0,
    seen: Object.fromEntries(
      Object.entries(record(raw.seen)).filter(
        ([, status]) => typeof status === 'string' && RANK[status],
      ),
    ) as Record<string, string>,
    counts: amounts(raw.counts),
    shows: amounts(raw.shows),
    homeRead: ids(raw.homeRead),
    homeDone: ids(raw.homeDone),
    reminders,
    extra: Object.fromEntries(Object.entries(raw).filter(([key]) => !KNOWN_FIELDS.has(key))),
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
  const seen: Record<string, string> = {};
  const shows: Record<string, number> = {};
  const reminders: Record<string, Reminder> = {};
  const read = new Set<string>();
  const done = new Set<string>();
  const tipIds = new Set(
    [a, b].flatMap((side) => [
      ...Object.keys(side.seen),
      ...Object.keys(side.shows),
      ...Object.keys(side.reminders),
      ...side.homeRead,
      ...side.homeDone,
    ]),
  );
  for (const id of tipIds) {
    const generationA = a.reminders[id]?.count ?? 0;
    const generationB = b.reminders[id]?.count ?? 0;
    let status: string | undefined;
    let showings: number | undefined;
    let reminder: Reminder | undefined;
    if (generationA !== generationB) {
      // The tip came back on one side: its newer generation replaces the older one's progress.
      const [newer, older] = generationA > generationB ? [a, b] : [b, a];
      status = older.seen[id] === 'learned' ? 'learned' : newer.seen[id];
      showings = newer.shows[id];
      reminder = newer.reminders[id];
      if (newer.homeRead.includes(id)) read.add(id);
      if (newer.homeDone.includes(id)) done.add(id);
    } else {
      const statusA = a.seen[id];
      const statusB = b.seen[id];
      status = (RANK[statusA] ?? 0) >= (RANK[statusB] ?? 0) ? (statusA ?? statusB) : statusB;
      showings = larger(a.shows[id], b.shows[id]);
      const reminderA = a.reminders[id];
      const reminderB = b.reminders[id];
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
    if (status) seen[id] = status;
    if (showings !== undefined) shows[id] = showings;
    if (reminder) reminders[id] = reminder;
  }
  const counts = { ...a.counts };
  for (const [event, count] of Object.entries(b.counts))
    counts[event] = larger(counts[event], count)!;
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
  return {
    ...a.extra,
    ...b.extra,
    enabled,
    ...(enabledAt ? { enabledAt } : {}),
    lastShown: Math.max(a.lastShown, b.lastShown),
    seen,
    counts,
    shows,
    ...(homeRead.length ? { homeRead } : {}),
    ...(homeDone.length ? { homeDone } : {}),
    ...(Object.keys(reminders).length ? { reminders } : {}),
  };
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

export interface TipSyncOptions {
  /** This device's tips now. */
  read: () => TipState;
  /** Saves merged tips on this device, without asking for another sync. */
  write: (state: TipState) => void;
  /**
   * Saves the tips to the server and resolves with its merged copy, or with `null` when the
   * server has no tip store (an older Relay), which stops syncing for this session.
   */
  send: (state: TipState) => Promise<unknown>;
  /** False once the account or session has changed, so a late reply is dropped. */
  current: () => boolean;
  now?: () => number;
}

/**
 * Keeps one account's tips in step with the server: `changed()` after a local change (saved
 * after a pause), `refresh()` on returning to the app or tab, `syncNow()` on sign-in. One request
 * runs at a time; a reply merges into whatever this device holds by then. Failures leave the
 * local tips as they are, for the next attempt.
 */
export function createTipSync({ read, write, send, current, now = Date.now }: TipSyncOptions) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let due = 0;
  let running = false;
  let again = false;
  let dirty = false;
  let stopped = false;
  let unsupported = false;
  let holdUntil = 0;
  let lastSynced = 0;

  function schedule(delay: number) {
    if (stopped || unsupported) return;
    const at = now() + Math.max(delay, holdUntil - now(), 0);
    if (timer !== undefined && due <= at) return;
    if (timer !== undefined) clearTimeout(timer);
    due = at;
    timer = setTimeout(
      () => {
        timer = undefined;
        void run();
      },
      Math.max(0, at - now()),
    );
  }

  async function run() {
    if (stopped || unsupported) return;
    if (now() < holdUntil) {
      schedule(0);
      return;
    }
    if (running) {
      again = true;
      return;
    }
    running = true;
    dirty = false;
    try {
      const reply = await send(read());
      if (stopped || !current()) return;
      if (reply === null) {
        unsupported = true;
        return;
      }
      lastSynced = now();
      const local = read();
      const merged = mergeServerTips(local, reply, now());
      if (!sameTips(merged, local)) write(merged);
    } catch {
      // Offline or refused: this device's tips stand, and the next change or return retries.
      dirty = true;
    } finally {
      running = false;
      if (again) {
        again = false;
        schedule(TIP_SYNC_DEBOUNCE_MS);
      }
    }
  }

  return {
    /** A local change: saved to the server after a pause. */
    changed() {
      dirty = true;
      schedule(TIP_SYNC_DEBOUNCE_MS);
    },
    /** Sign-in: fetch and merge now. */
    syncNow() {
      schedule(0);
    },
    /** Back in the app or tab: fetch now, unless it was fetched moments ago with nothing new. */
    refresh() {
      if (dirty || now() - lastSynced >= TIP_SYNC_REFRESH_MS) schedule(0);
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
