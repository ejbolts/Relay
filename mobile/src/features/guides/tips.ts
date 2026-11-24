import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import {
  parseTips,
  tipShown,
  tipStorageKey,
  withTipReminders,
  withTipsEnabled,
  type TipId,
  type TipState,
} from '../../../../frontend/src/tipsState';
import { createTipSync, type TipSync, type TipSyncOptions } from '../../../../frontend/src/tipSync';
import { deviceStorage } from '../../data/deviceStorage';
import { useUser } from '../../session/SessionProvider';

// Each account's tips on this phone, in the web's format and under its key (frontend/src/tipsState).
// Guided tips put away before their feature is used come back on the web's reminder schedule.
// The phone's copy is the source while offline; TipSyncHost merges it with the account's copy on
// the server (frontend/src/tipSync), so tips follow the account to the web and other devices.

const cache = new Map<string, TipState>();
const listeners = new Set<() => void>();
/** The running sync for each signed-in account (one at a time in practice). */
const syncs = new Map<string, TipSync>();

function read(account: string): TipState {
  let state = cache.get(account);
  if (!state) {
    let raw: string | null = null;
    try {
      raw = deviceStorage.getItem(tipStorageKey(account));
    } catch {
      // Without storage the tips still work for this session.
    }
    state = withTipReminders(parseTips(raw), Date.now());
    cache.set(account, state);
  }
  return state;
}

function write(account: string, change: TipState, fromSync = false) {
  const next = withTipReminders(change, Date.now());
  cache.set(account, next);
  try {
    deviceStorage.setItem(tipStorageKey(account), JSON.stringify(next));
  } catch {
    // Keep the in-memory state.
  }
  listeners.forEach((listener) => listener());
  // A local change reaches the server after a pause; a merged reply is already there.
  if (!fromSync) syncs.get(account)?.changed();
}

/**
 * Starts keeping one account's tips in step with the server, with the caller's transport and
 * session check. Returns the sync, whose `stop()` ends it.
 */
export function startTipSync(
  account: string,
  { send, current }: Pick<TipSyncOptions, 'send' | 'current'>,
): TipSync {
  const sync: TipSync = createTipSync({
    read: () => read(account),
    write: (next) => write(account, next, true),
    send,
    current: () => syncs.get(account) === sync && current(),
  });
  syncs.get(account)?.stop();
  syncs.set(account, sync);
  const stop = sync.stop;
  return {
    ...sync,
    stop: () => {
      stop();
      if (syncs.get(account) === sync) syncs.delete(account);
    },
  };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function seen(account: string, id: TipId, status: 'seen' | 'dismissed' | 'learned') {
  const state = read(account);
  if (state.seen[id] === status || (status !== 'learned' && state.seen[id])) return;
  write(account, { ...state, seen: { ...state.seen, [id]: status } });
}

const actions = new Map<string, ReturnType<typeof makeActions>>();

/** The actions on one account's tips, also for code outside React. */
export function tipsFor(account: string) {
  let found = actions.get(account);
  if (!found) {
    found = makeActions(account);
    actions.set(account, found);
  }
  return found;
}

function makeActions(account: string) {
  return {
    get: () => read(account),
    /** The feature is in use, so its tip has nothing left to teach. */
    learn: (id: TipId) => seen(account, id, 'learned'),
    /** Opened or acted on: seen, so it need not appear by itself again. */
    engage: (id: TipId) => seen(account, id, 'seen'),
    /** Retired for good. */
    dismiss: (id: TipId) => {
      const state = read(account);
      write(account, { ...state, seen: { ...state.seen, [id]: 'dismissed' } });
    },
    /** Opened from Home's bulb, which never spends the daily tip. */
    readHome: (id: TipId) => {
      const state = read(account);
      if (!state.homeRead?.includes(id))
        write(account, { ...state, homeRead: [...(state.homeRead ?? []), id] });
    },
    /** Put away with Got it: it leaves the bulb but can still appear where it applies. */
    doneHome: (id: TipId) => {
      const state = read(account);
      if (!state.homeDone?.includes(id))
        write(account, { ...state, homeDone: [...(state.homeDone ?? []), id] });
    },
    /** Show tips on or off; the account's other devices and the web follow the latest choice. */
    enable: (enabled: boolean) =>
      write(account, withTipsEnabled(read(account), enabled, Date.now())),
    /** A contextual tip appeared (the logger's): counted towards its showings and the daily tip. */
    shown: (id: TipId, now: number) => write(account, tipShown(read(account), id, now)),
    /** Keeps the tips off the server until `until`, while a nudge's showing may still be undone. */
    holdSync: (until: number) => syncs.get(account)?.hold(until),
    /** Any other change worked out by the shared rules, such as counting a tip's event. */
    update: (change: (state: TipState) => TipState) => write(account, change(read(account))),
  };
}

/** The signed-in account's tips and their actions. */
export function useTips() {
  const account = useUser().id;
  const state = useSyncExternalStore(subscribe, () => read(account));
  return { state, ...tipsFor(account) };
}

/**
 * Brings back guided tips whose reminder is due (7, 14 and 28 days after being put away) while the
 * app stays in memory: on mount and whenever it returns to the foreground, as the web does when
 * its tab becomes visible. Subscribers hear only of an actual change.
 */
export function applyDueTipReminders(account: string, now = Date.now()) {
  const state = read(account);
  const next = withTipReminders(state, now);
  if (next !== state) write(account, next);
}

export function useTipReminders(account: string) {
  useEffect(() => {
    applyDueTipReminders(account);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') applyDueTipReminders(account);
    });
    return () => subscription.remove();
  }, [account]);
}

/** For tests: forget the cached tips. */
export function resetTipsForTests() {
  cache.clear();
  syncs.forEach((sync) => sync.stop());
  syncs.clear();
}
