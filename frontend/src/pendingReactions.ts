import { useEffect, useRef, useSyncExternalStore } from 'react';
import { api, isConnectionFailure } from './api';
import { captureAccountCacheScope } from './accountCacheScope';
import { browserAccountStorage, type AccountStorage } from './deviceAccount';
import type { WorkoutReactionKind, WorkoutReactions } from './types';

/**
 * Reactions chosen without a connection wait here, per account, until the server can be reached.
 * Only the latest choice per workout is kept; `null` removes your reaction.
 */
export const PENDING_REACTIONS_KEY = 'relay-pending-reactions';
export const PENDING_REACTION_RETRY_MS = 5000;

export type PendingReaction = WorkoutReactionKind | null;
interface Saved {
  owner: string;
  items: Record<string, PendingReaction>;
}

const listeners = new Set<() => void>();
const sentListeners = new Set<(workoutId: string, value: WorkoutReactions) => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let listening = false;
let syncing: Promise<void> | null = null;

function read(storage: AccountStorage | null = browserAccountStorage()): Saved | null {
  try {
    const saved = JSON.parse(storage?.getItem(PENDING_REACTIONS_KEY) ?? 'null') as Saved | null;
    return saved &&
      typeof saved.owner === 'string' &&
      saved.items &&
      typeof saved.items === 'object'
      ? saved
      : null;
  } catch {
    return null;
  }
}

function currentItems(): Record<string, PendingReaction> {
  const owner = captureAccountCacheScope().owner;
  const saved = read();
  return owner && saved?.owner === owner ? saved.items : {};
}

function write(owner: string, items: Record<string, PendingReaction>) {
  const storage = browserAccountStorage();
  try {
    if (Object.keys(items).length)
      storage?.setItem(PENDING_REACTIONS_KEY, JSON.stringify({ owner, items }));
    else storage?.removeItem(PENDING_REACTIONS_KEY);
  } catch {
    // Storage is full or blocked; the in-flight choice is still lost only if the page closes.
  }
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
  write(owner, { ...currentItems(), [workoutId]: reaction });
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
      for (const [workoutId, reaction] of Object.entries(currentItems())) {
        if (!scope.isCurrent()) return;
        let value: WorkoutReactions | null = null;
        try {
          value = reaction
            ? await api.sharing.react(workoutId, reaction)
            : await api.sharing.removeReaction(workoutId);
        } catch (reason) {
          if (isConnectionFailure(reason) || !scope.isCurrent()) return;
        }
        const items = currentItems();
        // A newer choice made while this one was sending stays queued.
        if (items[workoutId] === reaction) {
          const rest = { ...items };
          delete rest[workoutId];
          write(owner, rest);
        }
        if (value) for (const listener of sentListeners) listener(workoutId, value);
      }
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
  const saved = read(storage);
  if (saved && saved.owner !== owner) clearPendingReactions(storage);
}
