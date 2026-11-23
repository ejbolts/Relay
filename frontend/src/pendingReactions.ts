import { useEffect, useRef, useSyncExternalStore } from 'react';
import { api, isConnectionFailure } from './api';
import { captureAccountCacheScope } from './accountCacheScope';
import { browserAccountStorage, type AccountStorage } from './deviceAccount';
import {
  PENDING_REACTION_RETRY_MS,
  PENDING_REACTIONS_KEY,
  pendingReactionsFor,
  readPendingReactionQueue,
  sendPendingReactions,
  withPendingReaction,
  writePendingReactionQueue,
  type PendingReaction,
} from './pendingReactionQueue';
import type { WorkoutReactions } from './types';

// Reactions chosen without a connection wait here, per account, until the server can be reached.
// The queue's rules are shared with the app (see pendingReactionQueue.ts).
export {
  PENDING_REACTION_RETRY_MS,
  PENDING_REACTIONS_KEY,
  type PendingReaction,
} from './pendingReactionQueue';

const listeners = new Set<() => void>();
const sentListeners = new Set<(workoutId: string, value: WorkoutReactions) => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let listening = false;
let syncing: Promise<void> | null = null;

function currentItems(): Record<string, PendingReaction> {
  return pendingReactionsFor(browserAccountStorage(), captureAccountCacheScope().owner);
}

function write(owner: string, items: Record<string, PendingReaction>) {
  writePendingReactionQueue(browserAccountStorage(), owner, items);
  for (const listener of listeners) listener();
}

/** The reaction waiting to send for a workout, or undefined when nothing is waiting. */
export function pendingReaction(workoutId: string): PendingReaction | undefined {
  const items = currentItems();
  return workoutId in items ? items[workoutId] : undefined;
}

/** Keeps the latest choice for a workout and sends it once the connection returns. */
export function queueReaction(workoutId: string, reaction: PendingReaction): void {
  const owner = captureAccountCacheScope().owner;
  if (!owner) return;
  write(owner, withPendingReaction(currentItems(), workoutId, reaction));
  ensureRetrying();
}

function online() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function retry() {
  if (!online() || (typeof document !== 'undefined' && document.visibilityState === 'hidden'))
    return;
  void syncPendingReactions();
}

function ensureRetrying() {
  if (typeof window === 'undefined') return;
  if (!listening) {
    listening = true;
    window.addEventListener('online', retry);
  }
  if (!timer && Object.keys(currentItems()).length)
    timer = setInterval(retry, PENDING_REACTION_RETRY_MS);
}

function stopRetrying() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

/**
 * Sends waiting reactions in turn. A connection failure keeps the rest for the next attempt; any
 * other refusal (for example the workout is no longer shared) drops that choice.
 */
export function syncPendingReactions(): Promise<void> {
  syncing ??= (async () => {
    try {
      const scope = captureAccountCacheScope();
      const owner = scope.owner;
      if (!owner) return;
      await sendPendingReactions({
        items: currentItems,
        send: (workoutId, reaction) =>
          reaction ? api.sharing.react(workoutId, reaction) : api.sharing.removeReaction(workoutId),
        connectionFailed: isConnectionFailure,
        current: scope.isCurrent,
        save: (items) => write(owner, items),
        sent: (workoutId, value) => {
          for (const listener of sentListeners) listener(workoutId, value);
        },
      });
    } finally {
      syncing = null;
      if (!Object.keys(currentItems()).length) stopRetrying();
    }
  })();
  return syncing;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const storageChanged = (event: StorageEvent) => {
    if (event.key === PENDING_REACTIONS_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', storageChanged);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', storageChanged);
  };
}

/** Follows a workout's waiting reaction and reports the server's totals once it has been sent. */
export function usePendingReaction(
  workoutId: string,
  onSent: (value: WorkoutReactions) => void,
): PendingReaction | undefined {
  const latest = useRef(onSent);
  latest.current = onSent;
  const pending = useSyncExternalStore(
    subscribe,
    () => pendingReaction(workoutId),
    () => undefined,
  );
  useEffect(() => {
    const sent = (id: string, value: WorkoutReactions) => {
      if (id === workoutId) latest.current(value);
    };
    sentListeners.add(sent);
    return () => void sentListeners.delete(sent);
  }, [workoutId]);
  useEffect(() => {
    if (pending === undefined) return;
    ensureRetrying();
    retry();
  }, [pending]);
  return pending;
}

export function clearPendingReactions(storage: AccountStorage | null) {
  try {
    storage?.removeItem(PENDING_REACTIONS_KEY);
  } catch {
    // Ignore unavailable storage.
  }
  stopRetrying();
  for (const listener of listeners) listener();
}

/** A different account signing in never sends the previous account's reactions. */
export function reconcilePendingReactions(owner: string, storage: AccountStorage | null) {
  const saved = readPendingReactionQueue(storage);
  if (saved && saved.owner !== owner) clearPendingReactions(storage);
}
