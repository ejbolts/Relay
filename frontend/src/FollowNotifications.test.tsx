// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import metadata from '../release.json';
import { ReleaseAnnouncement } from './ReleaseAnnouncement';
import { ReleaseAnnouncementContext } from './releaseAnnouncementContext';
import { rememberRelease } from './releaseAnnouncements';
import { useReleaseAnnouncement } from './useReleaseAnnouncement';
import { formatReleaseVersion } from './releaseMetadata';
import { FollowNotifications, NOTIFICATIONS_PER_PAGE } from './FollowNotifications';
import {
  markNotificationSnapshotRead,
  unreadNotificationReferences,
} from './notificationReadState';
import type { SharingNotifications } from './types';
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
  await act(async () => root.unmount());
  host.remove();
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
  rememberRelease(userId, metadata.version);
  await act(async () => root.render(<ReleaseInbox userId={userId} secondHeader={secondHeader} />));
}

it('keeps the release unread on opening, opens its notes with View, closes back to the page, and retains the read row across headers and remounts', async () => {
  await releaseInbox('inbox-view-sample', true);
  expect(host.querySelectorAll('[aria-label="Notifications, 1 unread"]')).toHaveLength(2);
  await click('Notifications, 1 unread');
  const row = document.querySelector('.release-notification-row')!;
  expect(row.textContent).toContain(`Relay ${metadata.version}`);
  expect(row.textContent).toContain(metadata.title);
  expect(row.querySelector('time')?.dateTime).toBe(metadata.date);
  expect(row.querySelector('.release-notification-new')?.textContent).toBe('New');
  expect(document.querySelector('.shared-card-empty')).toBeNull();
  expect(api.sharing.markNotificationsRead).not.toHaveBeenCalled();
  await click('Close Notifications');
  await click('Notifications, 1 unread');
  expect(document.querySelector('.release-notification-new')).not.toBeNull();

  await click(`View Relay ${metadata.version} release notes`);
  expect(document.querySelector('.follow-notifications')).toBeNull();
  expect(document.querySelectorAll('dialog')).toHaveLength(1);
  expect(document.querySelector('.release-announcement h3')?.textContent).toBe(metadata.title);
  expect(host.querySelectorAll('[aria-label="Notifications"]')).toHaveLength(2);
  await click(`Close Version ${formatReleaseVersion(metadata.version)}`);
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

it('counts the release in the 15-row page but only acknowledges displayed social events', async () => {
  snapshot = {
    requests: Array.from({ length: 15 }, (_, index) => ({ ...person, id: `request-${index}` })),
    accepted: [],
  };
  await releaseInbox('inbox-pagination-sample');
  await click('Notifications, 16 unread');
  const rows = () => document.querySelectorAll('.follow-notification-list > li');
  expect(rows()).toHaveLength(15);
  expect(rows()[0].classList.contains('release-notification-row')).toBe(true);
  expect(vi.mocked(api.sharing.markNotificationsRead).mock.lastCall![0]).toHaveLength(14);
  expect(unreadNotificationReferences(snapshot)).toHaveLength(1);
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 2 unread');
  await click('Next notifications page');
  expect(rows()).toHaveLength(1);
  expect(document.querySelector('.release-notification-row')).toBeNull();
  expect(unreadNotificationReferences(snapshot)).toHaveLength(0);
  expect(vi.mocked(api.sharing.markNotificationsRead).mock.lastCall![0]).toHaveLength(1);
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
});

it('keeps the installed release accessible when social notifications fail', async () => {
  vi.mocked(api.sharing.notifications).mockRejectedValue(new Error('Offline'));
  await releaseInbox('inbox-offline-sample');
  await click('Notifications, 1 unread');
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  expect(document.querySelector('.release-notification-row')).not.toBeNull();
  await click(`View Relay ${metadata.version} release notes`);
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
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications');
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
it('shows 15 notifications per page with pagination instead of a Manage friends link', async () => {
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
  expect(unreadNotificationReferences(snapshot)).toHaveLength(5);
  expect(vi.mocked(api.sharing.markNotificationsRead).mock.calls[0][0]).toHaveLength(15);
  await click('Next notifications page');
  expect(unreadNotificationReferences(snapshot)).toHaveLength(0);
  expect(vi.mocked(api.sharing.markNotificationsRead).mock.calls[1][0]).toHaveLength(5);
  expect(rows()).toHaveLength(5);
  expect(dialog()).toContain('Friend 19');
  expect(dialog()).not.toContain('Sam Preview');
  await click('Choose a notifications page');
  await click('Go to page 1');
  expect(dialog()).toContain('Page 1 of 2');
  await click('Next notifications page');
  await click('Close Notifications');
  await click('Notifications');
  expect(dialog()).toContain('Page 1 of 2');
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
  expect(document.querySelectorAll('.follow-notification-list li')).toHaveLength(15);
  expect(document.querySelector('dialog')?.textContent).toContain('Reply 6');
  expect(unreadNotificationReferences(snapshot)).toHaveLength(2);
  const first = vi.mocked(api.sharing.markNotificationsRead).mock.calls[0][0];
  expect(first).toHaveLength(15);
  expect(first.filter((ref) => ref.kind === 'comment')).toEqual(
    Array.from({ length: 6 }, (_, i) => ({
      kind: 'comment',
      id: `notice-${i}`,
      since: person.since,
    })),
  );
  vi.mocked(api.sharing.markNotificationsRead).mockRejectedValueOnce(new Error('Offline'));
  await click('Next notifications page');
  expect(document.querySelectorAll('.follow-notification-list li')).toHaveLength(2);
  expect(document.querySelector('dialog')?.textContent).toContain('Page 2 of 2');
  expect(document.querySelector('[role="alert"]')).toBeTruthy();
  expect(unreadNotificationReferences(snapshot)).toHaveLength(2);
  await click('Try again');
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(unreadNotificationReferences(snapshot)).toHaveLength(0);
  const last = vi.mocked(api.sharing.markNotificationsRead).mock.lastCall![0];
  expect(last).toEqual([
    { kind: 'accepted', id: 'accepted', since: person.since },
    { kind: 'reaction', id: 'reaction-8', since: person.since, workout_id: 'w1' },
  ]);
  const calls = vi.mocked(api.sharing.markNotificationsRead).mock.calls.length;
  await click('Previous notifications page');
  expect(api.sharing.markNotificationsRead).toHaveBeenCalledTimes(calls);
});
