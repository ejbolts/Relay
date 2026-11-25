import { useSyncExternalStore } from 'react';
import { onToastAccountChange, toastAccount } from './Toast';

// Removals waiting for their Undo toast to end (a goal, a friend), kept outside any one screen so
// a screen opened again while the toast still shows hides the item too and can't remove it twice.
//
// Each entry belongs to the session that made it (`toastAccount()`: the account and its session
// number), and a session change forgets the others, since their toasts are dropped without
// running anything. Each entry also has its own token, and only that token clears it, so a late
// completion of an older removal can never clear a newer removal of the same item.

interface Entry {
  kind: string;
  id: string;
  account: string;
  token: string;
}

let entries: readonly Entry[] = [];
let nextToken = 0;
const listeners = new Set<() => void>();

function set(next: readonly Entry[]) {
  entries = next;
  listeners.forEach((listener) => listener());
}

onToastAccountChange((account) => {
  const kept = entries.filter((entry) => entry.account === account);
  if (kept.length !== entries.length) set(kept);
});

/** Proof of one pending removal: pass it back to `pendingActions.remove`. */
export type PendingToken = string;

export const pendingActions = {
  /**
   * Marks `id` as waiting in `account`'s session (the current one by default) and returns the
   * token that clears it, or `null` if that item is already waiting: the caller must not start
   * the same removal twice.
   */
  add(kind: string, id: string, account = toastAccount()): PendingToken | null {
    if (
      entries.some((entry) => entry.kind === kind && entry.id === id && entry.account === account)
    )
      return null;
    const token = `${account}/${kind}/${id}/${++nextToken}`;
    set([...entries, { kind, id, account, token }]);
    return token;
  },
  /** The removal with this token finished, failed or was undone. Other tokens are untouched. */
  remove(token: PendingToken) {
    if (!entries.some((entry) => entry.token === token)) return;
    set(entries.filter((entry) => entry.token !== token));
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
