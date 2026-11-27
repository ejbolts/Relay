import { reactionChoice } from './friendFeedData';
import type { WorkoutReactionKind, WorkoutReactions } from './types';

// Reactions chosen without a connection, kept on the device per account until the server can be
// reached, shared by the web (localStorage) and the app (the phone's key-value store). Only the
// latest choice per workout is kept; `null` removes your reaction.

export const PENDING_REACTIONS_KEY = 'relay-pending-reactions';
export const PENDING_REACTION_RETRY_MS = 5000;

export type PendingReaction = WorkoutReactionKind | null;
export type PendingReactions = Record<string, PendingReaction>;

interface Saved {
  owner: string;
  items: PendingReactions;
}

/** The device storage the queue is kept in. */
export interface PendingReactionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The saved queue and whose it is, or null when there is none or it can't be read. */
export function readPendingReactionQueue(storage: PendingReactionStorage | null): Saved | null {
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

/** The account's waiting reactions; another account's queue is never shown or sent. */
export function pendingReactionsFor(
  storage: PendingReactionStorage | null,
  owner: string | null | undefined,
): PendingReactions {
  const saved = readPendingReactionQueue(storage);
  return owner && saved?.owner === owner ? saved.items : {};
}

/** Saves the account's queue, removing it once empty. */
export function writePendingReactionQueue(
  storage: PendingReactionStorage | null,
  owner: string,
  items: PendingReactions,
): void {
  try {
    if (Object.keys(items).length)
      storage?.setItem(PENDING_REACTIONS_KEY, JSON.stringify({ owner, items }));
    else storage?.removeItem(PENDING_REACTIONS_KEY);
  } catch {
    // Storage is full or blocked; the in-flight choice is still lost only if the app closes.
  }
}

/** The queue with a workout's latest choice. */
export function withPendingReaction(
  items: PendingReactions,
  workoutId: string,
  reaction: PendingReaction,
): PendingReactions {
  return { ...items, [workoutId]: reaction };
}

/** The queue once a choice has been sent, keeping a newer choice made while it was sending. */
export function withoutSentReaction(
  items: PendingReactions,
  workoutId: string,
  sent: PendingReaction,
): PendingReactions {
  if (!(workoutId in items) || items[workoutId] !== sent) return items;
  const rest = { ...items };
  delete rest[workoutId];
  return rest;
}

/**
 * Sends waiting reactions in turn. A connection failure keeps the rest for the next attempt; any
 * other refusal (for example the workout is no longer shared) drops that choice.
 */
export async function sendPendingReactions(queue: {
  /** The account's waiting reactions, read afresh. */
  items: () => PendingReactions;
  send: (workoutId: string, reaction: PendingReaction) => Promise<WorkoutReactions>;
  connectionFailed: (reason: unknown) => boolean;
  /** False once the account has signed out or changed. */
  current: () => boolean;
  /** Saves the queue without a choice that has been sent or refused. */
  save: (items: PendingReactions) => void;
  /** The server's totals after a choice was sent. */
  sent: (workoutId: string, value: WorkoutReactions) => void;
}): Promise<void> {
  for (const [workoutId, reaction] of Object.entries(queue.items())) {
    if (!queue.current()) return;
    let value: WorkoutReactions | null = null;
    try {
      value = await queue.send(workoutId, reaction);
    } catch (reason) {
      if (queue.connectionFailed(reason) || !queue.current()) return;
    }
    const items = queue.items();
    const rest = withoutSentReaction(items, workoutId, reaction);
    if (rest !== items) queue.save(rest);
    if (value) queue.sent(workoutId, value);
  }
}

/** The React button's spoken label while a choice waits for a connection. */
export function pendingReactionLabel(subject: string, pending: PendingReaction): string {
  const choice = reactionChoice(pending);
  return `${choice ? `${choice.label} reaction` : 'Reaction removal'} to ${subject} sends when you're back online`;
}
