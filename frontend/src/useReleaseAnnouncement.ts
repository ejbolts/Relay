import { useEffect, useState } from 'react';
import releaseHistory from '../release-history.json';
import releaseMetadata from '../release.json';
import type { AppNoticesState } from './appNotices';
import { releaseNoticeState } from './appNoticeRules';
import {
  hasReadReleaseNotice,
  hasSeenRelease,
  rememberRelease,
  rememberReleaseNoticeRead,
} from './releaseAnnouncements';
import { announcedRelease, parseRelease, parseReleaseHistory } from './releaseMetadata';

// A silent patch keeps announcing the notes of the release it follows, so nothing reopens.
const bundledRelease = announcedRelease(parseRelease(releaseMetadata)!);
const bundledHistory = parseReleaseHistory(releaseHistory, bundledRelease.version)!;

const ALWAYS_READY: Pick<AppNoticesState, 'ready' | 'notices' | 'record'> = {
  ready: true,
  notices: null,
  record: () => undefined,
};

/**
 * Announces the release actually running, once per account (see `releaseNoticeState`); a silent
 * patch announces the release it follows instead.
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
  const state = releaseNoticeState({
    version,
    releaseDate: bundledRelease.date,
    accountCreatedAt,
    releaseSeen: notices.notices?.release_seen,
    ready: notices.ready,
    seenOnDevice: userId !== null && hasSeenRelease(userId, version),
    noticeReadOnDevice: userId !== null && hasReadReleaseNotice(userId, version),
  });
  const { nothingNew } = state;

  // Remember it here too, so a later offline visit does not announce it after all.
  useEffect(() => {
    if (userId && notices.ready && nothingNew) {
      rememberRelease(userId, version);
      rememberReleaseNoticeRead(userId, version);
    }
  }, [userId, notices.ready, nothingNew, version]);

  const chosen = choice.userId === userId ? choice.open : null;
  const automatic = userId !== null && state.automatic;
  return {
    release: bundledRelease,
    history: bundledHistory,
    open: userId !== null && (chosen ?? automatic),
    /** False until the account has said what it has already seen, so nothing opens too early. */
    checked: notices.ready,
    noticeUnread: userId !== null && state.noticeUnread,
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
