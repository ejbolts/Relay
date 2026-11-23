// The one-off notices an account sees once across its devices (What's new and the weekly
// review): when each opens by itself and the keys a device remembers them under. Shared by the
// web and the app; each keeps the values in its own storage.

/** One-off notices the account has already seen on any device. */
export interface AppNotices {
  /** The newest release whose "What's new" has been dismissed. */
  release_seen: string | null;
  /** The first day of the latest week whose review has been shown. */
  weekly_review_seen: string | null;
}

/** How long sign-in waits for the account's notices before going by this device alone. */
export const APP_NOTICES_WAIT_MS = 4000;

const versionParts = (version: string) => version.split('.').map((part) => Number(part) || 0);

/** Whether `seen` is `version` or a later release. */
export function releaseAtLeast(seen: string | null | undefined, version: string): boolean {
  if (!seen) return false;
  const left = versionParts(seen);
  const right = versionParts(version);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

/** The account's notices after recording `change`, keeping what it had seen before. */
export function withAppNotices(
  previous: AppNotices | null | undefined,
  change: Partial<AppNotices>,
): AppNotices {
  return {
    release_seen: previous?.release_seen ?? null,
    weekly_review_seen: previous?.weekly_review_seen ?? null,
    ...change,
  };
}

/** The key a device remembers a dismissed What's new under. */
export function releaseSeenKey(userId: string, version: string): string {
  return `gym-logger-release-seen:${encodeURIComponent(userId)}:${version}`;
}

/** The key a device remembers an opened release notice (in the bell) under. */
export function releaseNoticeReadKey(userId: string, version: string): string {
  return `gym-logger-release-notice-read:${encodeURIComponent(userId)}:${version}`;
}

/** The key a device remembers the week whose review it last showed under. */
export function weeklyReviewShownKey(userId: string): string {
  return `gym-logger-weekly-review:${encodeURIComponent(userId)}`;
}

/** A remembered weekly review week, or null when it isn't a date. */
export function storedReviewWeek(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export interface ReleaseNoticeInput {
  version: string;
  /** The release's date, when it has one. */
  releaseDate: string | null | undefined;
  accountCreatedAt: string | null | undefined;
  /** The account's newest dismissed release, from any device. */
  releaseSeen: string | null | undefined;
  /** False until the account has said what it has seen (or the wait has run out). */
  ready: boolean;
  /** This device already closed What's new for this release. */
  seenOnDevice: boolean;
  /** This device already opened the release's notice in the bell. */
  noticeReadOnDevice: boolean;
}

export interface ReleaseNoticeState {
  /** Nothing in the release is new to this account, so it is never announced. */
  nothingNew: boolean;
  /** What's new opens by itself. */
  automatic: boolean;
  /** The bell shows the release as new. */
  noticeUnread: boolean;
}

/**
 * Whether What's new opens by itself, once per account. It is skipped when the account dismissed
 * it on another device, and for an account created on or after the release date: nothing in it
 * is new to someone who has only ever used this release.
 */
export function releaseNoticeState(input: ReleaseNoticeInput): ReleaseNoticeState {
  const seenElsewhere = releaseAtLeast(input.releaseSeen, input.version);
  const newerAccount =
    !!input.accountCreatedAt &&
    !!input.releaseDate &&
    input.accountCreatedAt.slice(0, 10) >= input.releaseDate;
  const nothingNew = seenElsewhere || newerAccount;
  return {
    nothingNew,
    automatic: input.ready && !nothingNew && !input.seenOnDevice,
    noticeUnread: !nothingNew && !input.noticeReadOnDevice,
  };
}

/** Whether this week's review has already been shown, here or on another of the account's devices. */
export function weeklyReviewShownThisWeek(
  shownHere: string | null,
  shownElsewhere: string | null | undefined,
  currentWeekStart: string,
): boolean {
  return shownHere === currentWeekStart || (!!shownElsewhere && shownElsewhere >= currentWeekStart);
}
