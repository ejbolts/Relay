import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { releaseNoticeState } from '../../../../frontend/src/appNoticeRules';
import { announcedRelease } from '../../../../frontend/src/releaseMetadata';
import { useUser } from '../../session/SessionProvider';
import { useServerRelease } from '../settings/settingsData';
import { recordAppNotices, useAppNotices } from './appNotices';
import {
  hasReadReleaseNotice,
  hasSeenRelease,
  rememberRelease,
  rememberReleaseNoticeRead,
  useNoticeMemory,
} from './noticeMemory';

/** Closing What's new: this phone and the account's other devices don't open it again. */
export function dismissRelease(client: QueryClient, userId: string, version: string) {
  rememberRelease(userId, version);
  recordAppNotices(client, { release_seen: version });
}

/**
 * The release the server runs, as Settings' What's new shows it (a silent patch announces the
 * release it follows), and whether it opens by itself or shows as new in the bell. The web's
 * rule (`releaseNoticeState`) decides both, with this phone's memory.
 */
export function useReleaseNotice() {
  const user = useUser();
  const client = useQueryClient();
  const server = useServerRelease();
  const notices = useAppNotices();
  useNoticeMemory();
  const release = server.data ? announcedRelease(server.data) : null;
  const version = release?.version ?? null;
  const state = release
    ? releaseNoticeState({
        version: release.version,
        releaseDate: release.date,
        accountCreatedAt: user.created_at,
        releaseSeen: notices.notices?.release_seen,
        ready: notices.ready,
        seenOnDevice: hasSeenRelease(user.id, release.version),
        noticeReadOnDevice: hasReadReleaseNotice(user.id, release.version),
      })
    : null;
  const nothingNew = state?.nothingNew ?? false;

  // Remember it here too, so a later offline visit doesn't announce it after all.
  useEffect(() => {
    if (version && notices.ready && nothingNew) {
      rememberRelease(user.id, version);
      rememberReleaseNoticeRead(user.id, version);
    }
  }, [user.id, version, notices.ready, nothingNew]);

  return {
    release,
    automatic: state?.automatic ?? false,
    /** The release and the account's notices have answered, so nothing opens out of turn. */
    checked: notices.ready && !server.isPending,
    noticeUnread: state?.noticeUnread ?? false,
    /** Opening the bell's notice also counts as having seen What's new. */
    readNotice: () => {
      if (!version) return;
      rememberReleaseNoticeRead(user.id, version);
      dismissRelease(client, user.id, version);
    },
  };
}
