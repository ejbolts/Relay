import { expect, it } from 'vitest';
import {
  commentNoticeText,
  newestFirst,
  noticeTime,
  notificationKey,
  notificationPageCount,
  notificationPageRows,
  notificationReference,
  notificationsInRows,
  notificationsLabel,
  socialNotificationCount,
  sortedSocialNotificationRows,
} from './notificationInbox';
import type { SharingNotifications } from './types';

const person = (id: string, since: string, is_read?: boolean) => ({
  id,
  display_name: `Sample ${id}`,
  profile_photo_url: null,
  since,
  ...(is_read === undefined ? {} : { is_read }),
});

const inbox: SharingNotifications = {
  requests: [person('r1', '2026-11-20T10:00:00Z', true)],
  accepted: [person('a1', '2026-11-22T10:00:00Z', false)],
  reactions: [
    {
      ...person('x1', '2026-11-21T10:00:00Z', false),
      workout_id: 'w1',
      workout_name: 'Push day',
      reaction: 'fire',
    },
  ],
  comments: [
    {
      ...person('c1', '2026-11-19T10:00:00Z', true),
      notice_id: 'n1',
      kind: 'reply',
      comment_id: 'k1',
      workout_id: 'w2',
      workout_name: 'Legs',
      body: 'Nice',
      reaction: null,
    },
  ],
};

it('lists social notices newest first', () => {
  expect(sortedSocialNotificationRows(inbox).map((row) => row.kind)).toEqual([
    'accepted',
    'reaction',
    'request',
    'comment',
  ]);
});

it('keeps pinned rows above newer ones and reads bad times as 0', () => {
  const rows = [
    { name: 'old', time: 1, pinned: true },
    { name: 'new', time: 9, pinned: false },
  ];
  expect(
    newestFirst(
      rows,
      (row) => row.time,
      (row) => row.pinned,
    ).map((row) => row.name),
  ).toEqual(['old', 'new']);
  expect(noticeTime('not a date')).toBe(0);
  expect(noticeTime(undefined)).toBe(0);
});

it('counts waiting requests even when read, and other notices until read', () => {
  expect(socialNotificationCount(inbox)).toBe(3);
  expect(socialNotificationCount(null)).toBe(0);
  expect(notificationsLabel(3)).toBe('Notifications, 3 unread');
  expect(notificationsLabel(0)).toBe('Notifications');
});

it('pages rows and collects the notices on a page by kind', () => {
  const rows = Array.from({ length: 23 }, (_, index) => index);
  expect(notificationPageCount(rows.length)).toBe(3);
  expect(notificationPageRows(rows, 3)).toEqual([20, 21, 22]);
  // A page past the end shows the last page.
  expect(notificationPageRows(rows, 9)).toEqual([20, 21, 22]);
  const page = notificationsInRows(sortedSocialNotificationRows(inbox).slice(0, 2));
  expect(page.accepted.map((item) => item.id)).toEqual(['a1']);
  expect(page.reactions?.map((item) => item.id)).toEqual(['x1']);
  expect(page.requests).toEqual([]);
});

it('identifies each notice with when it happened, and a reaction with its workout', () => {
  const [accepted, reaction, , comment] = sortedSocialNotificationRows(inbox);
  expect(notificationReference(reaction)).toEqual({
    kind: 'reaction',
    id: 'x1',
    since: '2026-11-21T10:00:00Z',
    workout_id: 'w1',
  });
  expect(notificationKey(notificationReference(comment))).toBe('comment:n1::2026-11-19T10:00:00Z');
  expect(notificationKey(notificationReference(accepted))).toBe(
    'accepted:a1::2026-11-22T10:00:00Z',
  );
});

it('words each kind of comment notice', () => {
  expect(commentNoticeText('comment')).toEqual({ verb: ' commented on ', noun: 'comment' });
  expect(commentNoticeText('reply').verb).toBe(' replied on ');
  expect(commentNoticeText('comment_reaction').noun).toBe('reaction to your comment');
});
