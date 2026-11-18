// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import metadata from '../release.json';
import { fetchRelease, watchReleases } from './releaseAnnouncements';
import { announcedRelease, announcedVersion, parseRelease } from './releaseMetadata';
import { useReleaseAnnouncement } from './useReleaseAnnouncement';

vi.mock('./releaseAnnouncements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./releaseAnnouncements')>()),
  fetchRelease: vi.fn(),
  watchReleases: vi.fn(),
}));

// A silent patch announces the release it follows; otherwise this is the running version.
const NOTES_VERSION = announcedVersion(parseRelease(metadata)!);

let root: Root;
let container: HTMLDivElement;
let announcement: ReturnType<typeof useReleaseAnnouncement>;

type Notices = Parameters<typeof useReleaseAnnouncement>[2];

function Harness({
  userId,
  createdAt,
  notices,
}: {
  userId: string | null;
  createdAt?: string | null;
  notices?: Notices;
}) {
  announcement = useReleaseAnnouncement(userId, createdAt, notices);
  return <p>{announcement.open ? announcement.release.title : 'No announcement'}</p>;
}

async function render(userId: string | null, createdAt?: string | null, notices?: Notices) {
  await act(async () =>
    root.render(<Harness userId={userId} createdAt={createdAt} notices={notices} />),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('installed release announcements', () => {
  it('keeps the notice unread until View, independently of automatic announcement dismissal', async () => {
    await render('notice-account-first');
    expect(announcement.noticeUnread).toBe(true);
    await act(async () => announcement.dismiss());
    expect(announcement.noticeUnread).toBe(true);
    await act(async () => announcement.readNotice());
    expect(announcement.open).toBe(false);
    expect(announcement.noticeUnread).toBe(false);
    expect(
      window.localStorage.getItem(
        `gym-logger-release-notice-read:notice-account-first:${NOTES_VERSION}`,
      ),
    ).toBe('1');
    await render('notice-account-second');
    expect(announcement.noticeUnread).toBe(true);
    await render('notice-account-first');
    expect(announcement.noticeUnread).toBe(false);
    await render(null);
    expect(announcement.noticeUnread).toBe(false);
  });

  it('does not reuse an older version notice read state for the installed version', async () => {
    window.localStorage.setItem('gym-logger-release-notice-read:notice-old-version:0.0.0', '1');
    await render('notice-old-version');
    expect(announcement.noticeUnread).toBe(true);
  });

  it('honours a notice read in an earlier browser session and survives blocked storage', async () => {
    window.localStorage.setItem(
      `gym-logger-release-notice-read:notice-stored:${NOTES_VERSION}`,
      '1',
    );
    await render('notice-stored');
    expect(announcement.noticeUnread).toBe(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    try {
      await render('notice-blocked-storage');
      expect(announcement.noticeUnread).toBe(true);
      await act(async () => announcement.readNotice());
      expect(announcement.noticeUnread).toBe(false);
      await act(async () => root.unmount());
      root = createRoot(container);
      await render('notice-blocked-storage');
      expect(announcement.noticeUnread).toBe(false);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('announces the running release without replacing it with future deployed notes', async () => {
    vi.mocked(fetchRelease).mockResolvedValue({
      ...metadata,
      version: '99.0.0',
      title: 'A future deployed release',
    });
    await render('installed-release-sample');
    expect(announcement.checked).toBe(true);
    expect(announcement.open).toBe(true);
    expect(announcement.release).toEqual(announcedRelease(parseRelease(metadata)!));
    expect(container.textContent).toBe(metadata.title);
    expect(fetchRelease).not.toHaveBeenCalled();
    expect(watchReleases).not.toHaveBeenCalled();
  });

  it('keeps dismissed notes closed through logout, login and a new app mount', async () => {
    const userId = 'dismiss-remount-sample';
    await render(userId);
    expect(announcement.open).toBe(true);
    await act(async () => announcement.dismiss());
    expect(announcement.open).toBe(false);
    expect(window.localStorage.getItem(`gym-logger-release-seen:${userId}:${NOTES_VERSION}`)).toBe(
      '1',
    );

    await render(null);
    expect(announcement.open).toBe(false);
    await render(userId);
    expect(announcement.open).toBe(false);
    await act(async () => root.unmount());
    root = createRoot(container);
    await render(userId);
    expect(announcement.open).toBe(false);

    await act(async () => announcement.show());
    expect(announcement.open).toBe(true);
    expect(container.textContent).toBe(metadata.title);
  });

  it('keeps each account dismissal separate when identity changes without a remount', async () => {
    await render(null);
    expect(announcement.open).toBe(false);
    await render('account-first-sample');
    expect(announcement.open).toBe(true);
    await act(async () => announcement.dismiss());

    await render('account-second-sample');
    expect(announcement.open).toBe(true);
    await act(async () => announcement.dismiss());
    await render('account-first-sample');
    expect(announcement.open).toBe(false);
    await render('account-second-sample');
    expect(announcement.open).toBe(false);
  });

  it('does not let an older release dismissal hide the currently installed release', async () => {
    const userId = 'previous-release-sample';
    window.localStorage.setItem(`gym-logger-release-seen:${userId}:0.0.0`, '1');
    await render(userId);
    expect(announcement.open).toBe(true);
    expect(announcement.release.version).toBe(NOTES_VERSION);
  });

  it('honours an installed-release dismissal recorded by an earlier browser session', async () => {
    const userId = 'earlier-session-sample';
    window.localStorage.setItem(`gym-logger-release-seen:${userId}:${NOTES_VERSION}`, '1');
    await render(userId);
    expect(announcement.open).toBe(false);
    expect(announcement.checked).toBe(true);
  });

  it('waits for the account before announcing, then skips a release seen on another device', async () => {
    const record = vi.fn();
    await render('second-device', null, { ready: false, notices: null, record });
    expect(announcement.checked).toBe(false);
    expect(announcement.open).toBe(false);

    await render('second-device', null, {
      ready: true,
      notices: { release_seen: NOTES_VERSION, weekly_review_seen: null },
      record,
    });
    expect(announcement.checked).toBe(true);
    expect(announcement.open).toBe(false);
    expect(announcement.noticeUnread).toBe(false);
    // Remembered here too, so a later offline visit stays quiet.
    expect(
      window.localStorage.getItem(`gym-logger-release-seen:second-device:${NOTES_VERSION}`),
    ).toBe('1');
  });

  it('announces an older release seen elsewhere, and records the dismissal for the account', async () => {
    const record = vi.fn();
    await render('upgraded', null, {
      ready: true,
      notices: { release_seen: '0.0.1', weekly_review_seen: null },
      record,
    });
    expect(announcement.open).toBe(true);
    await act(async () => announcement.dismiss());
    expect(announcement.open).toBe(false);
    expect(record).toHaveBeenCalledWith({ release_seen: NOTES_VERSION });
  });

  it('does not announce a release to an account created on or after its date', async () => {
    await render('new-account', `${metadata.date}T09:00:00Z`);
    expect(announcement.open).toBe(false);
    expect(announcement.noticeUnread).toBe(false);
    // Settings can still open it on request.
    await act(async () => announcement.show());
    expect(announcement.open).toBe(true);

    await render('older-account', '2020-01-01T09:00:00Z');
    expect(announcement.open).toBe(true);
  });
});
