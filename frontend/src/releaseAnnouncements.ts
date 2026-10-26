import type { Release } from './releaseMetadata';
import { parseRelease } from './releaseMetadata';

const seenThisSession = new Set<string>();
const readNoticesThisSession = new Set<string>();

function noticeReadKey(userId: string, version: string): string {
  return `gym-logger-release-notice-read:${encodeURIComponent(userId)}:${version}`;
}

export function hasReadReleaseNotice(userId: string, version: string): boolean {
  const key = noticeReadKey(userId, version);
  if (readNoticesThisSession.has(key)) return true;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function rememberReleaseNoticeRead(userId: string, version: string): void {
  const key = noticeReadKey(userId, version);
  readNoticesThisSession.add(key);
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Retain this session's read state even when device storage is unavailable.
  }
}

function seenKey(userId: string, version: string): string {
  return `gym-logger-release-seen:${encodeURIComponent(userId)}:${version}`;
}

export function hasSeenRelease(userId: string, version: string): boolean {
  const key = seenKey(userId, version);
  if (seenThisSession.has(key)) return true;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function rememberRelease(userId: string, version: string): void {
  const key = seenKey(userId, version);
  seenThisSession.add(key);
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Still suppress repeated announcements during this session if storage is unavailable.
  }
}

export async function fetchRelease(): Promise<Release | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    // The build emits release.json into dist; the worker never precaches this file.
    const response = await fetch('/release.json', {
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok ? parseRelease(await response.json()) : null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Check while the app stays open, as well as on reconnection and returning. */
export function watchReleases(
  onRelease: (release: Release) => void,
  load: () => Promise<Release | null> = fetchRelease,
): () => void {
  let stopped = false;
  let checking = false;
  const check = async () => {
    if (stopped || checking || !navigator.onLine || document.visibilityState !== 'visible') return;
    checking = true;
    try {
      const release = await load();
      if (!stopped && release) onRelease(release);
    } catch {
      // Offline, timeout, missing metadata or an interrupted deployment: retry on return.
    } finally {
      checking = false;
    }
  };
  window.addEventListener('online', check);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  const interval = setInterval(check, 60_000);
  void check();
  return () => {
    stopped = true;
    window.removeEventListener('online', check);
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', check);
    clearInterval(interval);
  };
}

export function canShowReleaseAnnouncement({
  loading,
  tab,
  hasOtherDialog,
  signingIn = false,
}: {
  loading: boolean;
  tab: string;
  hasOtherDialog: boolean;
  /** The sign-in screen is still animating away; data can finish loading before it ends. */
  signingIn?: boolean;
}): boolean {
  return !loading && !signingIn && tab !== 'log' && tab !== 'videos' && !hasOtherDialog;
}
