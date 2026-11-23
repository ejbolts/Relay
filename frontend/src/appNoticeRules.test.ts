import { describe, expect, it } from 'vitest';
import {
  releaseNoticeState,
  storedReviewWeek,
  weeklyReviewShownThisWeek,
  withAppNotices,
} from './appNoticeRules';
import { notificationCount, notificationRows } from './notificationInbox';
import type { Release } from './releaseMetadata';
import {
  blockProgressText,
  cardioReviewEmptyText,
  reviewDelta,
  reviewWeekName,
  reviewWeeksLimit,
} from './weeklyReviewDisplay';

const base = {
  version: '1.4.0',
  releaseDate: '2026-11-20',
  accountCreatedAt: '2026-01-02T09:00:00Z',
  releaseSeen: null,
  ready: true,
  seenOnDevice: false,
  noticeReadOnDevice: false,
};

describe('releaseNoticeState', () => {
  it('opens once the account has answered, and not after this device closed it', () => {
    expect(releaseNoticeState(base)).toEqual({
      nothingNew: false,
      automatic: true,
      noticeUnread: true,
    });
    expect(releaseNoticeState({ ...base, ready: false }).automatic).toBe(false);
    expect(releaseNoticeState({ ...base, seenOnDevice: true }).automatic).toBe(false);
    expect(releaseNoticeState({ ...base, noticeReadOnDevice: true }).noticeUnread).toBe(false);
  });

  it('has nothing new after another device saw this or a later release, or for newer accounts', () => {
    expect(releaseNoticeState({ ...base, releaseSeen: '1.4.0' }).nothingNew).toBe(true);
    expect(releaseNoticeState({ ...base, releaseSeen: '1.10.0' }).automatic).toBe(false);
    expect(releaseNoticeState({ ...base, releaseSeen: '1.3.9' }).automatic).toBe(true);
    expect(
      releaseNoticeState({ ...base, accountCreatedAt: '2026-11-20T08:00:00Z' }).noticeUnread,
    ).toBe(false);
  });
});

describe('weekly review memory', () => {
  it('counts the week as shown here or on a device that showed this week or later', () => {
    expect(weeklyReviewShownThisWeek('2026-11-23', null, '2026-11-23')).toBe(true);
    expect(weeklyReviewShownThisWeek('2026-11-16', '2026-11-23', '2026-11-23')).toBe(true);
    expect(weeklyReviewShownThisWeek('2026-11-16', '2026-11-16', '2026-11-23')).toBe(false);
    expect(storedReviewWeek('2026-11-23')).toBe('2026-11-23');
    expect(storedReviewWeek('soon')).toBeNull();
    expect(withAppNotices(null, { release_seen: '1.4.0' })).toEqual({
      release_seen: '1.4.0',
      weekly_review_seen: null,
    });
  });
});

describe('the bell’s app notices', () => {
  const release = { version: '1.4.0', title: 'Reviews', date: '2026-11-01' } as Release;
  const weeklyReview = { weekStart: '2026-11-16', weekEnd: '2026-11-22', unread: true };
  const reset = {
    user_id: 'u1',
    username: 'sam',
    display_name: 'Sam',
    requested_at: '2026-11-22T10:00:00Z',
  };
  const accepted = {
    id: 'f1',
    display_name: 'Alex',
    since: '2026-11-23T10:00:00Z',
    is_read: false,
  } as never;

  it('pins unread app notices above newer social rows and counts what is waiting', () => {
    const items = { requests: [], accepted: [accepted] };
    const notices = { release, releaseUnread: true, weeklyReview, resetRequests: [reset] };
    expect(notificationRows(items, notices).map((row) => row.kind)).toEqual([
      'weekly-review',
      'release',
      'accepted',
      'password-reset',
    ]);
    expect(notificationCount(items, notices)).toBe(4);
    expect(
      notificationRows(items, { release, weeklyReview: { ...weeklyReview, unread: false } }).map(
        (row) => row.kind,
      ),
    ).toEqual(['accepted', 'weekly-review', 'release']);
  });
});

describe('weekly review wording', () => {
  it('words changes, weeks and the block row as the popup shows them', () => {
    expect(reviewDelta(3)).toMatchObject({ text: '+3', tone: 'good' });
    expect(reviewDelta(-1.5, { unit: ' kg', better: null })).toMatchObject({
      text: '−1.5 kg',
      tone: 'neutral',
      label: 'down 1.5 kg on the week before',
    });
    expect(reviewDelta(0.01)).toMatchObject({ text: '±0', label: 'same as the week before' });
    expect(reviewDelta(null)).toBeNull();
    expect([0, 1, 4].map(reviewWeekName)).toEqual(['This week', 'Last week', '4 weeks ago']);
    expect(reviewWeeksLimit(0)).toBe(11);
    expect(reviewWeeksLimit(6)).toBe(5);
    expect(blockProgressText({ week: 3, weeks: 8 })).toBe('Week 3 of 8');
    expect(blockProgressText({ week: 9, weeks: 8 })).toBe('Week 9');
    expect(cardioReviewEmptyText(null)).toBe('No cardio data.');
    expect(cardioReviewEmptyText({ totalMinutes: 20, previousTotalMinutes: null, zones: [] })).toBe(
      'No zone goals set.',
    );
  });
});
