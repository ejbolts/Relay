import { useEffect, useState } from 'react';
import releaseHistory from '../release-history.json';
import releaseMetadata from '../release.json';
import { releaseAtLeast, type AppNoticesState } from './appNotices';
import {
  hasReadReleaseNotice,
  hasSeenRelease,
  rememberRelease,
  rememberReleaseNoticeRead,
} from './releaseAnnouncements';
import { parseRelease, parseReleaseHistory } from './releaseMetadata';

const bundledRelease = parseRelease(releaseMetadata)!;
const bundledHistory = parseReleaseHistory(releaseHistory, bundledRelease.version)!;

const ALWAYS_READY: Pick<AppNoticesState, 'ready' | 'notices' | 'record'> = {
  ready: true,
  notices: null,
  record: () => undefined,
};

/**
 * Announces the release actually running, once per account. It is skipped when the account
 * dismissed it on another device, and for an account created on or after the release date:
 * nothing in it is new to someone who has only ever used this release.
 */
export function useReleaseAnnouncement(
  userId: string | null,
  accountCreatedAt: string | null = null,
  notices: Pick<AppNoticesState, 'ready' | 'notices' | 'record'> = ALWAYS_READY,
) {
  // `null` follows the automatic decision; Settings can open it and Close shuts it either way.
  const [choice, setChoice] = useState<{ userId: string | null; open: boolean | null }>({
    userId,
    open: null,
  });
  const version = bundledRelease.version;
  const seenElsewhere = releaseAtLeast(notices.notices?.release_seen, version);
  const newerAccount =
    !!accountCreatedAt &&
    !!bundledRelease.date &&
    accountCreatedAt.slice(0, 10) >= bundledRelease.date;
  const nothingNew = seenElsewhere || newerAccount;

  // Remember it here too, so a later offline visit does not announce it after all.
  useEffect(() => {
    if (userId && notices.ready && nothingNew) {
      rememberRelease(userId, version);
      rememberReleaseNoticeRead(userId, version);
    }
  }, [userId, notices.ready, nothingNew, version]);

  const chosen = choice.userId === userId ? choice.open : null;
  const automatic =
    userId !== null && notices.ready && !nothingNew && !hasSeenRelease(userId, version);
  return {
    release: bundledRelease,
    history: bundledHistory,
    open: userId !== null && (chosen ?? automatic),
    /** False until the account has said what it has already seen, so nothing opens too early. */
    checked: notices.ready,
    noticeUnread: userId !== null && !nothingNew && !hasReadReleaseNotice(userId, version),
    readNotice: () => {
      if (userId) {
        rememberReleaseNoticeRead(userId, version);
        rememberRelease(userId, version);
        notices.record({ release_seen: version });
      }
      setChoice({ userId, open: false });
    },
    show: () => setChoice({ userId, open: true }),
    dismiss: () => {
      if (userId) {
        rememberRelease(userId, version);
        notices.record({ release_seen: version });
      }
      setChoice({ userId, open: false });
    },
  };
}
