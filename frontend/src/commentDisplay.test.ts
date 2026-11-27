import { expect, it } from 'vitest';
import { moreRepliesLabel, threadRoot, visibleReplies } from './commentDisplay';
import type { WorkoutComment } from './types';

const reply = (id: string): WorkoutComment => ({
  id,
  author: { id: 'a', display_name: 'Alex', profile_photo_url: null },
  body: id,
  parent_id: 'root',
  reply_to: null,
  created_at: '2026-11-27T10:00:00Z',
  edited_at: null,
  can_edit: false,
  can_delete: false,
  reactions: { counts: [], yours: null },
});

it('shows two replies and folds the rest until the thread is opened', () => {
  const replies = ['r1', 'r2', 'r3', 'r4'].map(reply);
  expect(visibleReplies(replies, false)).toEqual({ shown: replies.slice(0, 2), hidden: 2 });
  expect(visibleReplies(replies, true)).toEqual({ shown: replies, hidden: 0 });
  expect(visibleReplies(replies.slice(0, 2), false)).toEqual({
    shown: replies.slice(0, 2),
    hidden: 0,
  });
  expect(moreRepliesLabel(1)).toBe('+1 reply');
  expect(moreRepliesLabel(3)).toBe('+3 replies');
});

it('shows every reply when a folded one is highlighted', () => {
  const replies = ['r1', 'r2', 'r3'].map(reply);
  expect(visibleReplies(replies, false, 'r3').hidden).toBe(0);
  expect(visibleReplies(replies, false, 'r1').hidden).toBe(1);
});

it('names the thread a comment belongs to', () => {
  expect(threadRoot(reply('r1'))).toBe('root');
  expect(threadRoot({ ...reply('root'), parent_id: null })).toBe('root');
});
