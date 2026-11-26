import { expect, it, vi } from 'vitest';
import {
  PENDING_REACTIONS_KEY,
  pendingReactionLabel,
  pendingReactionsFor,
  sendPendingReactions,
  withoutSentReaction,
  withPendingReaction,
  writePendingReactionQueue,
  type PendingReactions,
} from './pendingReactionQueue';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    values,
  };
}

it("saves one account's queue and never shows it to another", () => {
  const storage = memoryStorage();
  writePendingReactionQueue(storage, 'A', { w1: 'fire' });
  expect(pendingReactionsFor(storage, 'A')).toEqual({ w1: 'fire' });
  expect(pendingReactionsFor(storage, 'B')).toEqual({});
  expect(pendingReactionsFor(storage, null)).toEqual({});
  writePendingReactionQueue(storage, 'A', {});
  expect(storage.values.has(PENDING_REACTIONS_KEY)).toBe(false);
  storage.setItem(PENDING_REACTIONS_KEY, 'not json');
  expect(pendingReactionsFor(storage, 'A')).toEqual({});
});

it('keeps the latest choice, and a newer choice survives an older one being sent', () => {
  const queue = withPendingReaction(withPendingReaction({}, 'w1', 'fire'), 'w1', null);
  expect(queue).toEqual({ w1: null });
  expect(withoutSentReaction(queue, 'w1', 'fire')).toBe(queue);
  expect(withoutSentReaction(queue, 'w1', null)).toEqual({});
});

it('stops at a connection failure and drops a refused choice', async () => {
  let items: PendingReactions = { w1: 'fire', w2: 'like', w3: null };
  const sent = vi.fn();
  const offline = new Error('offline');
  const send = vi.fn(async (workoutId: string) => {
    if (workoutId === 'w2') throw new Error('refused');
    if (workoutId === 'w3') throw offline;
    return { counts: [], yours: null };
  });
  await sendPendingReactions({
    items: () => items,
    send,
    connectionFailed: (reason) => reason === offline,
    current: () => true,
    save: (next) => (items = next),
    sent,
  });
  expect(send).toHaveBeenCalledTimes(3);
  expect(sent).toHaveBeenCalledTimes(1);
  expect(sent).toHaveBeenCalledWith('w1', { counts: [], yours: null });
  // w1 was sent and w2 refused; w3 waits for the connection.
  expect(items).toEqual({ w3: null });
});

it('says what waits to send', () => {
  expect(pendingReactionLabel('Alex’s Push', 'fire')).toBe(
    "Fire reaction to Alex’s Push sends when you're back online",
  );
  expect(pendingReactionLabel('Alex’s Push', '🫡')).toBe(
    "🫡 reaction to Alex’s Push sends when you're back online",
  );
  expect(pendingReactionLabel('Alex’s Push', null)).toBe(
    "Reaction removal to Alex’s Push sends when you're back online",
  );
});
