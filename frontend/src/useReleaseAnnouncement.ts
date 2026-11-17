import { useState } from 'react';
import releaseHistory from '../release-history.json';
import releaseMetadata from '../release.json';
import {
  hasReadReleaseNotice,
  hasSeenRelease,
  rememberRelease,
  rememberReleaseNoticeRead,
} from './releaseAnnouncements';
import { parseRelease, parseReleaseHistory } from './releaseMetadata';

const bundledRelease = parseRelease(releaseMetadata)!;
const bundledHistory = parseReleaseHistory(releaseHistory, bundledRelease.version)!;

/** Announce the release actually running, once per account and browser. */
export function useReleaseAnnouncement(userId: string | null) {
  const [state, setState] = useState(() => ({
    userId,
    open: userId !== null && !hasSeenRelease(userId, bundledRelease.version),
  }));
  return {
    release: bundledRelease,
    history: bundledHistory,
    open:
      userId !== null &&
      (state.userId === userId ? state.open : !hasSeenRelease(userId, bundledRelease.version)),
    checked: true,
    noticeUnread: userId !== null && !hasReadReleaseNotice(userId, bundledRelease.version),
    readNotice: () => {
      if (userId) {
        rememberReleaseNoticeRead(userId, bundledRelease.version);
        rememberRelease(userId, bundledRelease.version);
      }
      setState({ userId, open: false });
    },
    show: () => setState({ userId, open: true }),
    dismiss: () => {
      if (userId) rememberRelease(userId, bundledRelease.version);
      setState({ userId, open: false });
    },
  };
}
