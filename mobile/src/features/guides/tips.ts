import { useSyncExternalStore } from 'react';
import {
  parseTips,
  tipStorageKey,
  withTipReminders,
  type TipId,
  type TipState,
} from '../../../../frontend/src/tipsState';
import { deviceStorage } from '../../data/deviceStorage';
import { useUser } from '../../session/SessionProvider';

// Each account's tips on this phone, in the web's format and under its key (frontend/src/tipsState).
// Guided tips put away before their feature is used come back on the web's reminder schedule.

const cache = new Map<string, TipState>();
const listeners = new Set<() => void>();

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

function write(account: string, change: TipState) {
  const next = withTipReminders(change, Date.now());
  cache.set(account, next);
  try {
    deviceStorage.setItem(tipStorageKey(account), JSON.stringify(next));
  } catch {
    // Keep the in-memory state.
  }
  listeners.forEach((listener) => listener());
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
    enable: (enabled: boolean) => write(account, { ...read(account), enabled }),
  };
}

/** The signed-in account's tips and their actions. */
export function useTips() {
  const account = useUser().id;
  const state = useSyncExternalStore(subscribe, () => read(account));
  return { state, ...tipsFor(account) };
}

/** For tests: forget the cached tips. */
export function resetTipsForTests() {
  cache.clear();
}
