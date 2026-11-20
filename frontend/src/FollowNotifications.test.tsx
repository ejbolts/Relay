// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { notifyNotificationsChanged } from './notificationEvents';
import metadata from '../release.json';
import { ReleaseAnnouncement } from './ReleaseAnnouncement';
import { ReleaseAnnouncementContext } from './releaseAnnouncementContext';
import { rememberRelease } from './releaseAnnouncements';
import { useReleaseAnnouncement } from './useReleaseAnnouncement';
import { announcedVersion, formatReleaseVersion } from './releaseMetadata';
import { FollowNotifications, NOTIFICATIONS_PER_PAGE } from './FollowNotifications';
import {
  markNotificationSnapshotRead,
  unreadNotificationReferences,
} from './notificationReadState';
import type { SharingNotifications } from './types';
import { onWeeklyReviewRequested, publishWeeklyReviewNotice } from './weeklyReviewNotice';
import { clearWorkoutFocus, useWorkoutFocus, type WorkoutFocus } from './workoutFocus';
import { onAdminAccountFocusRequested } from './adminAccountFocus';
import { UserContext, type UserSession } from './userContext';
import { onSharedProfileRequested } from './sharedProfileRequest';

// A silent patch keeps announcing the release whose notes it ships.
const announced = announcedVersion(metadata);
const person = {
  id: 'sample',
  display_name: 'Sam Preview',
  profile_photo_url: null,
  since: '2026-10-19T00:00:00Z',
};
const reaction = {
  ...person,
  id: 'alex',
  display_name: 'Alex Preview',
  workout_id: 'w1',
  workout_name: 'Leg day',
  reaction: 'love' as const,
};
let root: Root;
let host: HTMLDivElement;
let snapshot: SharingNotifications;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  snapshot = { requests: [], accepted: [], reactions: [] };
  vi.spyOn(api.sharing, 'notifications').mockImplementation(async () => snapshot);
  vi.spyOn(api.sharing, 'markNotificationsRead').mockImplementation(async (refs) => {
    snapshot = markNotificationSnapshotRead(snapshot, refs);
  });
});
afterEach(async () => {
  publishWeeklyReviewNotice(null);
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function click(label: string) {
  const b = [...document.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  );
  expect(b, label).toBeTruthy();
  await act(async () => b!.click());
}
async function render() {
  await act(async () => root.render(<FollowNotifications active />));
}

it('updates the closed bell on a socket invalidation before the next fallback poll', async () => {
  vi.useFakeTimers();
  await render();
  snapshot = { requests: [person], accepted: [] };
  await act(async () => notifyNotificationsChanged());
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
  expect(api.sharing.markNotificationsRead).not.toHaveBeenCalled();
  expect(api.sharing.notifications).toHaveBeenCalledTimes(2);
  snapshot = { requests: [person], accepted: [], reactions: [reaction] };
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 2 unread');
});

it('fetches again when events arrive during a request rather than losing the newer notice', async () => {
  let resolve!: (value: SharingNotifications) => void;
  vi.mocked(api.sharing.notifications).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await render();
  snapshot = { requests: [person], accepted: [] };
  await act(async () => {
    notifyNotificationsChanged();
    notifyNotificationsChanged();
    resolve({ requests: [], accepted: [] });
  });
  expect(api.sharing.notifications).toHaveBeenCalledTimes(2);
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
});

it('refreshes and reads incoming events while the inbox is open, without a read-event loop', async () => {
  await render();
  await click('Notifications');
  snapshot = { requests: [], accepted: [], reactions: [reaction] };
  vi.mocked(api.sharing.markNotificationsRead).mockImplementation(async (refs) => {
    snapshot = markNotificationSnapshotRead(snapshot, refs);
    notifyNotificationsChanged();
  });
  await act(async () => notifyNotificationsChanged());
  expect(document.querySelector('dialog')?.textContent).toContain('Leg day');
  expect(api.sharing.markNotificationsRead).toHaveBeenCalledTimes(1);
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications');
});

it('catches up when visible or online and ignores events for an inactive header', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await render();
  snapshot = { requests: [person], accepted: [] };
  visibility.mockReturnValue('hidden');
  await act(async () => notifyNotificationsChanged());
  expect(api.sharing.notifications).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue('visible');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
  snapshot = { requests: [], accepted: [] };
  await act(async () => window.dispatchEvent(new Event('online')));
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications');
  await act(async () => root.render(<FollowNotifications active={false} />));
  vi.mocked(api.sharing.notifications).mockClear();
  await act(async () => notifyNotificationsChanged());
  expect(api.sharing.notifications).not.toHaveBeenCalled();
});

it('recovers from a failed fetch on the next notification event', async () => {
  await render();
  vi.mocked(api.sharing.notifications).mockRejectedValueOnce(new Error('Offline'));
  await act(async () => notifyNotificationsChanged());
  snapshot = { requests: [person], accepted: [] };
  await act(async () => notifyNotificationsChanged());
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
});

it('retries an invalidation queued behind a failed request', async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(api.sharing.notifications).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  await render();
  snapshot = { requests: [person], accepted: [] };
  await act(async () => {
    notifyNotificationsChanged();
    reject(new Error('Connection interrupted'));
  });
  expect(api.sharing.notifications).toHaveBeenCalledTimes(2);
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
});

function ReleaseInbox({
  userId,
  secondHeader = false,
}: {
  userId: string;
  secondHeader?: boolean;
}) {
  const announcement = useReleaseAnnouncement(userId);
  return (
    <ReleaseAnnouncementContext.Provider value={announcement}>
      {announcement.open && (
        <ReleaseAnnouncement release={announcement.release} onClose={announcement.dismiss} />
      )}
      <FollowNotifications active />
      {secondHeader && <FollowNotifications active={false} />}
    </ReleaseAnnouncementContext.Provider>
  );
}

async function releaseInbox(userId: string, secondHeader = false) {
  // The automatic announcement was already dismissed; the inbox notice still awaits View.
  rememberRelease(userId, announced);
  await act(async () => root.render(<ReleaseInbox userId={userId} secondHeader={secondHeader} />));
}

it('keeps the release unread on opening, opens its notes with View, closes back to the page, and retains the read row across headers and remounts', async () => {
  await releaseInbox('inbox-view-sample', true);
  expect(host.querySelectorAll('[aria-label="Notifications, 1 unread"]')).toHaveLength(2);
  await click('Notifications, 1 unread');
  const row = document.querySelector('.release-notification-row')!;
  expect(row.textContent).toContain(`Relay ${announced}`);
  expect(row.textContent).toContain(metadata.title);
  expect(row.querySelector('time')?.dateTime).toBe(metadata.date);
  expect(row.querySelector('.release-notification-new')?.textContent).toBe('New');
  expect(document.querySelector('.shared-card-empty')).toBeNull();
  expect(api.sharing.markNotificationsRead).not.toHaveBeenCalled();
  await click('Close Notifications');
  await click('Notifications, 1 unread');
  expect(document.querySelector('.release-notification-new')).not.toBeNull();

  await click(`View Relay ${announced} release notes`);
  expect(document.querySelector('.follow-notifications')).toBeNull();
  expect(document.querySelectorAll('dialog')).toHaveLength(1);
  expect(document.querySelector('.release-announcement h3')?.textContent).toBe(metadata.title);
  expect(host.querySelectorAll('[aria-label="Notifications"]')).toHaveLength(2);
  await click(`Close Version ${formatReleaseVersion(announced)}`);
  expect(document.querySelectorAll('dialog')).toHaveLength(0);
  expect(document.querySelector('.follow-notifications')).toBeNull();
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Notifications');
  await click('Notifications');
  expect(document.querySelector('.release-notification-row')).not.toBeNull();
  expect(document.querySelector('.release-notification-new')).toBeNull();
  await act(async () => root.unmount());
  root = createRoot(host);
  await releaseInbox('inbox-view-sample');
  await click('Notifications');
  expect(document.querySelector('.release-notification-row')).not.toBeNull();
  expect(document.querySelector('.release-notification-new')).toBeNull();
});

it('counts the release in the 10-row page but only acknowledges displayed social events', async () => {
  snapshot = {
    requests: [],
    accepted: [],
    reactions: Array.from({ length: 15 }, (_, index) => ({ ...reaction, id: `reaction-${index}` })),
  };
  await releaseInbox('inbox-pagination-sample');
  await click('Notifications, 16 unread');
  const rows = () => document.querySelectorAll('.follow-notification-list > li');
  expect(rows()).toHaveLength(10);
  expect(rows()[0].classList.contains('release-notification-row')).toBe(true);
  expect(vi.mocked(api.sharing.markNotificationsRead).mock.lastCall![0]).toHaveLength(9);
  expect(unreadNotificationReferences(snapshot)).toHaveLength(6);
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 7 unread');
  await click('Next notifications page');
  expect(rows()).toHaveLength(6);
  expect(document.querySelector('.release-notification-row')).toBeNull();
  expect(unreadNotificationReferences(snapshot)).toHaveLength(0);
  expect(vi.mocked(api.sharing.markNotificationsRead).mock.lastCall![0]).toHaveLength(6);
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
});

it('keeps the installed release accessible when social notifications fail', async () => {
  vi.mocked(api.sharing.notifications).mockRejectedValue(new Error('Offline'));
  await releaseInbox('inbox-offline-sample');
  await click('Notifications, 1 unread');
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  expect(document.querySelector('.release-notification-row')).not.toBeNull();
  await click(`View Relay ${announced} release notes`);
  expect(document.querySelector('.release-announcement h3')?.textContent).toBe(metadata.title);
});

it('reads requests, accepted requests and reactions on open without removing their contents or adding Dismiss buttons', async () => {
  snapshot = { requests: [person], accepted: [{ ...person, id: 'riley' }], reactions: [reaction] };
  const accept = vi.spyOn(api.sharing, 'acceptFriend').mockResolvedValue({ status: 'friends' });
  await render();
  await click('Notifications, 3 unread');
  expect(api.sharing.markNotificationsRead).toHaveBeenCalledWith([
    { kind: 'request', id: 'sample', since: person.since },
    { kind: 'accepted', id: 'riley', since: person.since },
    { kind: 'reaction', id: 'alex', since: person.since, workout_id: 'w1' },
  ]);
  // The request keeps its badge until it is answered.
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
  expect(document.querySelector('dialog')?.textContent).toContain('Leg day');
  expect(document.querySelector('dialog')?.textContent).not.toContain('Dismiss');
  snapshot = { ...snapshot, requests: [] };
  await click('Accept Sam Preview');
  expect(accept).toHaveBeenCalledWith('sample');
  await click('Close Notifications');
  await click('Notifications');
  expect(document.querySelector('dialog')?.textContent).toContain('Leg day');
  expect(api.sharing.markNotificationsRead).toHaveBeenCalledTimes(1);
  expect(document.querySelector('dialog')?.textContent).not.toContain('Manage friends');
});
it('shows 10 notifications per page with pagination instead of a Manage friends link', async () => {
  snapshot = {
    requests: [person],
    accepted: [],
    reactions: Array.from({ length: 19 }, (_, index) => ({
      ...reaction,
      id: `friend-${index}`,
      display_name: `Friend ${index + 1}`,
    })),
  };
  await render();
  await click('Notifications, 20 unread');
  const rows = () => document.querySelectorAll('.follow-notification-list li');
  const dialog = () => document.querySelector('dialog')!.textContent;
  expect(rows()).toHaveLength(NOTIFICATIONS_PER_PAGE);
  expect(dialog()).toContain('Sam Preview');
  expect(dialog()).toContain('Page 1 of 2');
  expect(dialog()).not.toContain('Manage friends');
  expect(unreadNotificationReferences(snapshot)).toHaveLength(10);
  expect(vi.mocked(api.sharing.markNotificationsRead).mock.calls[0][0]).toHaveLength(10);
  await click('Next notifications page');
  expect(unreadNotificationReferences(snapshot)).toHaveLength(0);
  expect(vi.mocked(api.sharing.markNotificationsRead).mock.calls[1][0]).toHaveLength(10);
  expect(rows()).toHaveLength(10);
  expect(dialog()).toContain('Friend 19');
  expect(dialog()).not.toContain('Sam Preview');
  await click('Page 1 of 2');
  expect(dialog()).toContain('Page 1 of 2');
  expect(document.querySelector('.pagination-controls')?.classList).toContain('is-sheet-footer');
  await click('Next notifications page');
  await click('Close Notifications');
  await click('Notifications, 1 unread');
  expect(dialog()).toContain('Page 1 of 2');
});

it('keeps counting friend requests until they are accepted or declined', async () => {
  snapshot = {
    requests: [person, { ...person, id: 'riley', display_name: 'Riley Preview' }],
    accepted: [],
    reactions: [],
  };
  vi.spyOn(api.sharing, 'removeFriend').mockResolvedValue(undefined);
  await render();
  await click('Notifications, 2 unread');
  await click('Close Notifications');
  expect(unreadNotificationReferences(snapshot)).toHaveLength(0);
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 2 unread');
  expect(host.querySelector('.profile-request-badge')?.textContent).toBe('2');

  // Read requests stay actionable, and answering one takes it off the badge.
  await click('Notifications, 2 unread');
  snapshot = { ...snapshot, requests: [snapshot.requests[1]] };
  await click('Decline Sam Preview');
  await click('Close Notifications');
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
});
it('hides pagination when every notification fits on one page', async () => {
  snapshot = { requests: [person], accepted: [], reactions: [reaction] };
  await render();
  await click('Notifications, 2 unread');
  expect(document.querySelector('.pagination-controls')).toBeNull();
});
it('keeps the unread badge when reading fails and retries without losing notices', async () => {
  snapshot = { requests: [], accepted: [], reactions: [reaction] };
  vi.mocked(api.sharing.markNotificationsRead).mockRejectedValueOnce(new Error('Offline'));
  await render();
  await click('Notifications, 1 unread');
  expect(document.querySelector('[role="alert"]')).toBeTruthy();
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
  await click('Try again');
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications');
  expect(document.querySelector('dialog')?.textContent).toContain('Leg day');
});
it('keeps a read request actionable after a failed decline', async () => {
  snapshot = { requests: [person], accepted: [] };
  const decline = vi
    .spyOn(api.sharing, 'removeFriend')
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue(undefined);
  await render();
  await click('Notifications, 1 unread');
  await click('Decline Sam Preview');
  expect(document.querySelector('[role="alert"]')).toBeTruthy();
  snapshot = { requests: [], accepted: [] };
  await click('Decline Sam Preview');
  expect(decline).toHaveBeenCalledTimes(2);
  expect(document.querySelector('dialog')?.textContent).toContain("You're all caught up");
});
it('does not locally acknowledge a reaction that changed after the displayed snapshot', () => {
  const old = { requests: [], accepted: [], reactions: [reaction] };
  const newer = { ...old, reactions: [{ ...reaction, since: '2026-10-19T00:01:00Z' }] };
  expect(
    unreadNotificationReferences(
      markNotificationSnapshotRead(newer, unreadNotificationReferences(old)),
    ),
  ).toHaveLength(1);
});

it('sends the bulk read snapshot as JSON to the server', async () => {
  vi.mocked(api.sharing.markNotificationsRead).mockRestore();
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetch);
  const refs = unreadNotificationReferences({ requests: [], accepted: [], reactions: [reaction] });
  await api.sharing.markNotificationsRead(refs);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('/api/sharing/notifications/read');
  expect(new Headers(options.headers).get('Content-Type')).toBe('application/json');
  expect(JSON.parse(options.body)).toEqual({ items: refs });
});

it('paginates mixed comment notices and reads only displayed events, retrying a failed page', async () => {
  snapshot = {
    requests: [person],
    accepted: [{ ...person, id: 'accepted' }],
    reactions: Array.from({ length: 9 }, (_, i) => ({ ...reaction, id: `reaction-${i}` })),
    comments: Array.from({ length: 6 }, (_, i) => ({
      ...person,
      notice_id: `notice-${i}`,
      comment_id: `comment-${i}`,
      workout_id: 'w1',
      workout_name: 'Bench day',
      kind: i === 0 ? ('comment_reaction' as const) : ('reply' as const),
      body: `Reply ${i + 1}`,
      reaction: i === 0 ? ('love' as const) : null,
    })),
  };
  await render();
  await click('Notifications, 17 unread');
  expect(document.querySelectorAll('.follow-notification-list li')).toHaveLength(10);
  expect(document.querySelector('dialog')?.textContent).toContain('Reply 6');
  expect(unreadNotificationReferences(snapshot)).toHaveLength(7);
  const first = vi.mocked(api.sharing.markNotificationsRead).mock.calls[0][0];
  expect(first).toHaveLength(10);
  expect(first.filter((ref) => ref.kind === 'comment')).toEqual(
    Array.from({ length: 6 }, (_, i) => ({
      kind: 'comment',
      id: `notice-${i}`,
      since: person.since,
    })),
  );
  vi.mocked(api.sharing.markNotificationsRead).mockRejectedValueOnce(new Error('Offline'));
  await click('Next notifications page');
  expect(document.querySelectorAll('.follow-notification-list li')).toHaveLength(7);
  expect(document.querySelector('dialog')?.textContent).toContain('Page 2 of 2');
  expect(document.querySelector('[role="alert"]')).toBeTruthy();
  expect(unreadNotificationReferences(snapshot)).toHaveLength(7);
  await click('Try again');
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(unreadNotificationReferences(snapshot)).toHaveLength(0);
  const last = vi.mocked(api.sharing.markNotificationsRead).mock.lastCall![0];
  expect(last).toEqual([
    { kind: 'accepted', id: 'accepted', since: person.since },
    ...Array.from({ length: 6 }, (_, i) => ({
      kind: 'reaction',
      id: `reaction-${i + 3}`,
      since: person.since,
      workout_id: 'w1',
    })),
  ]);
  const calls = vi.mocked(api.sharing.markNotificationsRead).mock.calls.length;
  await click('Previous notifications page');
  expect(api.sharing.markNotificationsRead).toHaveBeenCalledTimes(calls);
});

it('orders all notification types newest first before paginating', async () => {
  snapshot = {
    requests: [{ ...person, since: '2026-11-04T12:00:00Z' }],
    accepted: [{ ...person, id: 'accepted', since: '2026-11-06T12:00:00Z' }],
    reactions: [{ ...reaction, since: '2026-11-07T12:00:00Z' }],
    comments: [
      {
        ...person,
        notice_id: 'comment',
        comment_id: 'c1',
        workout_id: 'w1',
        workout_name: 'Older workout',
        kind: 'comment',
        body: 'Sample comment',
        reaction: null,
        since: '2026-10-30T12:00:00Z',
      },
    ],
  };
  await releaseInbox('date-order-sample');
  await click('Notifications, 5 unread');
  const dates = [...document.querySelectorAll('.follow-notification-list time')].map((time) =>
    Date.parse(time.getAttribute('datetime')!),
  );
  expect(dates).toEqual([...dates].sort((a, b) => b - a));
  // The release row sorts by its own date, so check the social rows around it.
  expect(
    document.querySelector('.follow-notification-list > li:not(.release-notification-row)')
      ?.textContent,
  ).toContain('Leg day');
  expect(document.querySelector('.follow-notification-list li:last-child')?.textContent).toContain(
    'Sample comment',
  );
});

it('replies to a comment notice from a thread opened at that comment', async () => {
  const comment = (id: string, parent: string | null, name: string) => ({
    id,
    author: { id, display_name: name, profile_photo_url: null },
    body: `${name} said hi`,
    parent_id: parent,
    reply_to: null,
    created_at: person.since,
    edited_at: null,
    can_edit: false,
    can_delete: false,
    reactions: { counts: [], yours: null },
  });
  const notice = {
    ...person,
    notice_id: 'notice-reply',
    comment_id: 'c-sam',
    workout_id: 'w9',
    workout_name: 'Upper body workout',
    kind: 'comment' as const,
    body: 'Sam Preview said hi',
    reaction: null,
  };
  snapshot = {
    requests: [],
    accepted: [],
    comments: [
      notice,
      { ...notice, notice_id: 'notice-react', kind: 'comment_reaction', reaction: 'love' },
    ],
  };
  // The notified comment is on the second page, so the thread loads until it appears.
  const comments = vi
    .spyOn(api.sharing, 'comments')
    .mockResolvedValueOnce({ items: [comment('c-other', null, 'Alex')], total: 2, next_offset: 1 })
    .mockResolvedValueOnce({
      items: [comment('c-sam', null, 'Sam Preview')],
      total: 2,
      next_offset: null,
    });
  const add = vi
    .spyOn(api.sharing, 'addComment')
    .mockResolvedValue(comment('c-new', 'c-sam', 'Me'));
  await render();
  await click('Notifications, 2 unread');
  expect(document.querySelectorAll('button[aria-label="Reply to Sam Preview"]')).toHaveLength(1);
  await click('Reply to Sam Preview');
  const thread = document.querySelector('dialog.follow-notification-thread');
  expect(thread?.textContent).toContain('Upper body workout');
  expect(document.querySelector('dialog.follow-notifications')).toBeNull();
  expect(comments).toHaveBeenCalledWith('w9', 1);
  expect(thread?.querySelector('.comment-replying')?.textContent).toContain('@Sam Preview');
  const textarea = thread!.querySelector('textarea')!;
  expect(document.activeElement).toBe(textarea);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(textarea, 'Thanks!');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('Send');
  expect(add).toHaveBeenCalledWith('w9', 'Thanks!', 'c-sam', null);
  await click('Close Upper body workout');
  expect(document.querySelector('dialog.follow-notification-thread')).toBeNull();
  expect(document.activeElement).toBe(host.querySelector('.follow-notification-button'));
});

it("lists last week's review, counts it until it has been seen and opens it with View", async () => {
  const requested = vi.fn();
  const stop = onWeeklyReviewRequested(requested);
  snapshot = { requests: [], accepted: [], reactions: [reaction] };
  publishWeeklyReviewNotice({ weekStart: '2026-11-02', weekEnd: '2026-11-08', unread: true });
  await render();
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 2 unread');
  await click('Notifications, 2 unread');
  const row = document.querySelector('.weekly-review-notification-row')!;
  expect(row.textContent).toContain('Weekly review');
  expect(row.textContent).toContain('2 Nov – 8 Nov');
  expect(row.querySelector('.release-notification-new')?.textContent).toBe('New');
  await click("View last week's review");
  expect(requested).toHaveBeenCalledTimes(1);
  expect(document.querySelector('dialog.follow-notifications')).toBeNull();

  await act(async () =>
    publishWeeklyReviewNotice({ weekStart: '2026-11-02', weekEnd: '2026-11-08', unread: false }),
  );
  await click('Notifications');
  expect(document.querySelector('.weekly-review-notification-row')).not.toBeNull();
  expect(
    document.querySelector('.weekly-review-notification-row .release-notification-new'),
  ).toBeNull();
  stop();
});

it('leaves the review out once no review is available', async () => {
  await render();
  await click('Notifications');
  expect(document.querySelector('.weekly-review-notification-row')).toBeNull();
});

it('opens a reaction or comment notice at that workout in Social, keeping Reply separate', async () => {
  let latest: WorkoutFocus | null = null;
  function Probe() {
    latest = useWorkoutFocus();
    return null;
  }
  const probeHost = document.createElement('div');
  const probe = createRoot(probeHost);
  await act(async () => probe.render(<Probe />));
  snapshot = {
    requests: [],
    accepted: [person],
    reactions: [reaction],
    comments: [
      {
        ...person,
        notice_id: 'n1',
        comment_id: 'c-sam',
        workout_id: 'w9',
        workout_name: 'Upper body workout',
        kind: 'reply',
        body: 'Nice one',
        reaction: null,
      },
    ],
  };
  try {
    await render();
    await click('Notifications, 3 unread');
    // A friend request row has nothing to open.
    expect(document.querySelectorAll('.follow-notification-open')).toHaveLength(2);
    await click('Open Alex Preview’s reaction on Leg day');
    expect(document.querySelector('dialog.follow-notifications')).toBeNull();
    expect(latest).toMatchObject({
      workoutId: 'w1',
      workoutName: 'Leg day',
      panel: 'people',
      personId: 'alex',
    });
    clearWorkoutFocus(latest!.key);

    await click('Notifications');
    await click('Open Sam Preview’s reply on Upper body workout');
    expect(latest).toMatchObject({ workoutId: 'w9', panel: 'comments', commentId: 'c-sam' });
    clearWorkoutFocus(latest!.key);
  } finally {
    await act(async () => probe.unmount());
  }
});

const adminSession: UserSession = {
  user: {
    id: 'owner',
    username: 'owner',
    display_name: 'Owner',
    is_admin: true,
    can_upload_videos: true,
    created_at: '2026-10-01T10:00:00Z',
  },
  updateUser: () => undefined,
  signOut: async () => undefined,
  accountDeleted: async () => undefined,
};

it('shows admins who asked for a password reset until it is handled, and opens the account', async () => {
  let requests = [
    {
      user_id: 'riley',
      username: 'riley',
      display_name: 'Riley Sample',
      requested_at: '2026-10-20T09:00:00Z',
    },
  ];
  vi.spyOn(api.admin, 'passwordResetRequests').mockImplementation(async () => requests);
  vi.spyOn(api.admin, 'usernameReminderRequests').mockResolvedValue([]);
  const opened = vi.fn();
  const stop = onAdminAccountFocusRequested(opened);
  try {
    await act(async () =>
      root.render(
        <UserContext.Provider value={adminSession}>
          <FollowNotifications active />
        </UserContext.Provider>,
      ),
    );
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Notifications, 1 unread',
    );

    await click('Notifications, 1 unread');
    const row = document.querySelector('.password-reset-notification-row');
    expect(row?.textContent).toContain('Riley Sample asked for a password reset');
    expect(row?.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-20T09:00:00Z');
    // Opening the inbox does not read it away: it counts until an admin deals with it.
    expect(api.sharing.markNotificationsRead).not.toHaveBeenCalled();
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Notifications, 1 unread',
    );

    await click('Review Riley Sample’s password reset request');

    expect(document.querySelector('dialog.follow-notifications')).toBeNull();
    expect(opened).toHaveBeenCalledOnce();

    requests = [];
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications');
  } finally {
    stop();
  }
});

it('shows admins who asked for their username until it is handled, and opens the account', async () => {
  let requests = [
    {
      user_id: 'jordan',
      username: 'jordan',
      display_name: 'Jordan Sample',
      requested_at: '2026-10-21T09:00:00Z',
    },
  ];
  vi.spyOn(api.admin, 'passwordResetRequests').mockResolvedValue([]);
  vi.spyOn(api.admin, 'usernameReminderRequests').mockImplementation(async () => requests);
  const opened = vi.fn();
  const stop = onAdminAccountFocusRequested(opened);
  try {
    await act(async () =>
      root.render(
        <UserContext.Provider value={adminSession}>
          <FollowNotifications active />
        </UserContext.Provider>,
      ),
    );
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Notifications, 1 unread',
    );

    await click('Notifications, 1 unread');
    const row = document.querySelector('.username-reminder-notification-row');
    expect(row?.textContent).toContain('Jordan Sample asked for their username');
    expect(row?.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-21T09:00:00Z');
    expect(api.sharing.markNotificationsRead).not.toHaveBeenCalled();

    await click('Review Jordan Sample’s username request');

    expect(document.querySelector('dialog.follow-notifications')).toBeNull();
    expect(opened).toHaveBeenCalledOnce();

    requests = [];
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications');
  } finally {
    stop();
  }
});

it('never asks the admin API for members', async () => {
  const load = vi.spyOn(api.admin, 'passwordResetRequests');
  const loadUsernames = vi.spyOn(api.admin, 'usernameReminderRequests');
  await render();
  await click('Notifications');
  expect(load).not.toHaveBeenCalled();
  expect(loadUsernames).not.toHaveBeenCalled();
  expect(document.querySelector('.password-reset-notification-row')).toBeNull();
});

it('pins the unread release and weekly review above newer social notices', async () => {
  snapshot = {
    requests: [],
    accepted: [],
    reactions: Array.from({ length: 12 }, (_, index) => ({
      ...reaction,
      id: `later-${index}`,
      since: '2099-01-01T12:00:00Z',
    })),
  };
  await releaseInbox('inbox-pinned-sample');
  await act(async () =>
    publishWeeklyReviewNotice({ weekStart: '2026-11-09', weekEnd: '2026-11-15', unread: true }),
  );
  await click('Notifications, 14 unread');
  const rows = () => [...document.querySelectorAll('.follow-notification-list > li')];
  expect(rows()[0].classList.contains('release-notification-row')).toBe(true);
  expect(rows()[1].classList.contains('weekly-review-notification-row')).toBe(true);

  // Once read, they return to date order behind the newer notices.
  await click(`View Relay ${announced} release notes`);
  await click(`Close Version ${formatReleaseVersion(announced)}`);
  await act(async () =>
    publishWeeklyReviewNotice({ weekStart: '2026-11-09', weekEnd: '2026-11-15', unread: false }),
  );
  await click(document.querySelector('.follow-notification-button')!.getAttribute('aria-label')!);
  expect(rows()[0].classList.contains('release-notification-row')).toBe(false);
  expect(rows()[0].textContent).toContain('Alex Preview');
});

it('keeps a dot on notices that were unread when the inbox opened, until it opens again', async () => {
  snapshot = {
    requests: [],
    accepted: [{ ...person, id: 'accepted', is_read: true }],
    reactions: [reaction],
  };
  await render();
  await click('Notifications, 1 unread');
  expect(api.sharing.markNotificationsRead).toHaveBeenCalledOnce();
  expect(unreadNotificationReferences(snapshot)).toHaveLength(0);
  const fresh = () =>
    [...document.querySelectorAll('.follow-notification-list > li.is-new')].map(
      (row) => row.textContent,
    );
  expect(fresh()).toHaveLength(1);
  expect(fresh()[0]).toContain('Leg day');

  await click('Close Notifications');
  await click('Notifications');
  expect(fresh()).toEqual([]);
});

it("opens a person's shared profile from their name or photo, keeping Accept and Decline", async () => {
  const opened = vi.fn();
  const stop = onSharedProfileRequested(opened);
  snapshot = { requests: [person], accepted: [], reactions: [reaction] };
  await render();
  await click('Notifications, 2 unread');
  expect(document.querySelector('[aria-label="Accept Sam Preview"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Decline Sam Preview"]')).not.toBeNull();

  await click('Sam Preview');
  expect(opened).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'sample' }));
  expect(document.querySelector('.follow-notifications')).toBeNull();

  await click('Notifications, 1 unread');
  await click('View Alex Preview’s profile');
  expect(opened).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'alex' }));
  expect(document.querySelector('.follow-notifications')).toBeNull();
  stop();
});
