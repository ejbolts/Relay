// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { LAST_USER_KEY } from './deviceAccount';
import {
  clearPendingReactions,
  pendingReaction,
  queueReaction,
  reconcilePendingReactions,
  syncPendingReactions,
} from './pendingReactions';

function signIn(id: string) {
  localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id, display_name: `Sample ${id}` }));
}

beforeEach(() => {
  signIn('A');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
});
afterEach(() => {
  clearPendingReactions(localStorage);
  localStorage.clear();
  vi.restoreAllMocks();
});

it('keeps only the latest choice per workout, including a removal', () => {
  queueReaction('w1', 'fire');
  queueReaction('w1', null);
  queueReaction('w2', 'like');
  expect(pendingReaction('w1')).toBeNull();
  expect(pendingReaction('w2')).toBe('like');
  expect(pendingReaction('w3')).toBeUndefined();
});

it('sends removals, keeps choices on connection failure and drops refused ones', async () => {
  const remove = vi
    .spyOn(api.sharing, 'removeReaction')
    .mockResolvedValue({ counts: [], yours: null });
  const react = vi
    .spyOn(api.sharing, 'react')
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockRejectedValueOnce(new ApiError('Not found', 'not_found', 404));
  queueReaction('w1', null);
  queueReaction('w2', 'like');
  await syncPendingReactions();
  expect(remove).toHaveBeenCalledWith('w1');
  expect(pendingReaction('w1')).toBeUndefined();
  expect(pendingReaction('w2')).toBe('like');
  await syncPendingReactions();
  expect(react).toHaveBeenCalledTimes(2);
  expect(pendingReaction('w2')).toBeUndefined();
});

it("never shows or sends another account's waiting reactions", async () => {
  const react = vi.spyOn(api.sharing, 'react');
  queueReaction('w1', 'fire');
  signIn('B');
  expect(pendingReaction('w1')).toBeUndefined();
  await syncPendingReactions();
  expect(react).not.toHaveBeenCalled();
  reconcilePendingReactions('B', localStorage);
  signIn('A');
  expect(pendingReaction('w1')).toBeUndefined();
});
