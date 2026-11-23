import { useSyncExternalStore } from 'react';
import { onToastAccountChange, toastAccount } from './Toast';

// Removals waiting for their Undo toast to end (a goal, a friend), kept outside any one screen so
// a screen opened again while the toast still shows hides the item too and can't remove it twice.
// Each entry belongs to the account that made it: a session change forgets the others, since
// their toasts are dropped without running anything.

interface Entry {
  kind: string;
  id: string;
  account: string;
}

let entries: readonly Entry[] = [];
const listeners = new Set<() => void>();

function set(next: readonly Entry[]) {
  entries = next;
  listeners.forEach((listener) => listener());
}

onToastAccountChange((account) => {
  const kept = entries.filter((entry) => entry.account === account);
  if (kept.length !== entries.length) set(kept);
});

const same = (a: Entry, b: Omit<Entry, 'account'> & { account?: string }) =>
  a.kind === b.kind && a.id === b.id && a.account === (b.account ?? toastAccount());

export const pendingActions = {
  /**
   * Marks `id` as waiting, for `account` (the current session by default). Returns false if it
   * already is: the caller must not start the same removal twice.
   */
  add(kind: string, id: string, account = toastAccount()): boolean {
    if (entries.some((entry) => same(entry, { kind, id, account }))) return false;
    set([...entries, { kind, id, account }]);
    return true;
  },
  /** The removal finished, failed or was undone. */
  remove(kind: string, id: string, account = toastAccount()) {
    if (!entries.some((entry) => same(entry, { kind, id, account }))) return;
    set(entries.filter((entry) => !same(entry, { kind, id, account })));
  },
  /** For tests. */
  clear() {
    set([]);
  },
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The ids of this kind still waiting in the current session. */
export function usePendingActions(kind: string): readonly string[] {
  const all = useSyncExternalStore(subscribe, () => entries);
  const account = toastAccount();
  return all.filter((entry) => entry.kind === kind && entry.account === account).map((e) => e.id);
}
