import { onlineManager } from '@tanstack/react-query';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import {
  PENDING_REACTION_RETRY_MS,
  pendingReactionsFor,
  sendPendingReactions,
  withPendingReaction,
  writePendingReactionQueue,
  type PendingReaction,
  type PendingReactions,
} from '../../../../frontend/src/pendingReactionQueue';
import type { WorkoutReactions } from '../../../../frontend/src/types';
import { deviceStorage } from '../../data/deviceStorage';
import { connectionFailed, socialApi } from './socialApi';

// Reactions chosen offline wait on the phone, per account, and send once Relay can be reached, as
// on the web. The queue's rules and format are the web's (see frontend/src/pendingReactionQueue).

/** The signed-in account whose queue is shown and sent. */
let owner: string | null = null;
/** The queue as last read or written, so screens don't read storage on every render. */
let cache: { owner: string | null; items: PendingReactions } | null = null;
const listeners = new Set<() => void>();
const sentListeners = new Set<(workoutId: string, value: WorkoutReactions) => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let stopOnline: (() => void) | undefined;
let syncing: Promise<void> | null = null;

function items(): PendingReactions {
  if (cache?.owner !== owner) cache = { owner, items: pendingReactionsFor(deviceStorage, owner) };
  return cache.items;
}

function write(account: string, next: PendingReactions) {
  writePendingReactionQueue(deviceStorage, account, next);
  if (account === owner) cache = { owner, items: next };
  for (const listener of listeners) listener();
}

/** Keeps the latest choice for a workout and sends it once the connection returns. */
export function queueReaction(account: string, workoutId: string, reaction: PendingReaction) {
  owner = account;
  write(account, withPendingReaction(items(), workoutId, reaction));
  ensureRetrying();
}

/** The reaction waiting to send for a workout, or undefined when nothing is waiting. */
export function pendingReaction(workoutId: string): PendingReaction | undefined {
  const queue = items();
  return workoutId in queue ? queue[workoutId] : undefined;
}

function retry() {
  if (!onlineManager.isOnline() || AppState.currentState === 'background') return;
  void syncPendingReactions();
}

function ensureRetrying() {
  stopOnline ??= onlineManager.subscribe((online) => {
    if (online) retry();
  });
  if (!timer && Object.keys(items()).length) timer = setInterval(retry, PENDING_REACTION_RETRY_MS);
}

function stopRetrying() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

/** Sends the account's waiting reactions in turn (see sendPendingReactions). */
export function syncPendingReactions(): Promise<void> {
  syncing ??= (async () => {
    const account = owner;
    try {
      if (!account) return;
      await sendPendingReactions({
        items,
        send: (workoutId, reaction) =>
          reaction ? socialApi.react(workoutId, reaction) : socialApi.removeReaction(workoutId),
        connectionFailed,
        current: () => owner === account,
        save: (next) => write(account, next),
        sent: (workoutId, value) => {
          for (const listener of sentListeners) listener(workoutId, value);
        },
      });
    } finally {
      syncing = null;
      if (!Object.keys(items()).length) stopRetrying();
    }
  })();
  return syncing;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Follows a workout's waiting reaction for the signed-in `account`, and reports the server's
 * totals once it has been sent.
 */
export function usePendingReaction(
  account: string,
  workoutId: string,
  onSent: (value: WorkoutReactions) => void,
): PendingReaction | undefined {
  const latest = useRef(onSent);
  useEffect(() => {
    latest.current = onSent;
  });
  useEffect(() => {
    if (owner === account) return;
    // Another account's queue is never shown or sent.
    owner = account;
    for (const listener of listeners) listener();
  }, [account]);
  const pending = useSyncExternalStore(subscribe, () =>
    owner === account ? pendingReaction(workoutId) : undefined,
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
