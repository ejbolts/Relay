import type { Release } from './releaseMetadata';
import type {
  CommentNotice,
  NotificationReadReference,
  PasswordResetRequest,
  ReactionNotice,
  SharingConnection,
  SharingNotifications,
  UsernameReminderRequest,
} from './types';
import type { WeeklyReviewNotice } from './weeklyReview';

// The notifications bell's social notices (friend requests, accepted requests, reactions and
// comments): their order, count, read references and wording, shared by the web and the app.

/** Notices shown at a time: a page on the web, and each "Show more" in the app. */
export const NOTIFICATIONS_PER_PAGE = 10;

export type SocialNotificationRow =
  | { kind: 'comment'; item: CommentNotice }
  | { kind: 'request'; item: SharingConnection }
  | { kind: 'reaction'; item: ReactionNotice }
  | { kind: 'accepted'; item: SharingConnection };

/** The social notices as rows, before sorting. */
export function socialNotificationRows(items: SharingNotifications): SocialNotificationRow[] {
  return [
    ...(items.comments ?? []).map((item) => ({ kind: 'comment' as const, item })),
    ...items.requests.map((item) => ({ kind: 'request' as const, item })),
    ...(items.reactions ?? []).map((item) => ({ kind: 'reaction' as const, item })),
    ...items.accepted.map((item) => ({ kind: 'accepted' as const, item })),
  ];
}

/** A notice's time in milliseconds, or 0 when it can't be read. */
export function noticeTime(value: string | null | undefined): number {
  const time = Date.parse(value ?? '');
  return Number.isNaN(time) ? 0 : time;
}

/** Newest first, with pinned rows (such as an unread release notice) above the rest. */
export function newestFirst<Row>(
  rows: Row[],
  time: (row: Row) => number,
  pinned: (row: Row) => boolean = () => false,
): Row[] {
  return rows.sort((a, b) => Number(pinned(b)) - Number(pinned(a)) || time(b) - time(a));
}

/** The social notices, newest first. */
export function sortedSocialNotificationRows(items: SharingNotifications): SocialNotificationRow[] {
  return newestFirst(socialNotificationRows(items), (row) => noticeTime(row.item.since));
}

export function notificationPageCount(total: number, perPage = NOTIFICATIONS_PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** One page of rows; a page past the end shows the last one. */
export function notificationPageRows<Row>(
  rows: Row[],
  page: number,
  perPage = NOTIFICATIONS_PER_PAGE,
): Row[] {
  const current = Math.min(page, notificationPageCount(rows.length, perPage));
  return rows.slice((current - 1) * perPage, current * perPage);
}

/** The social notices among the rows on screen, which opening the inbox marks read. */
export function notificationsInRows(
  rows: readonly ({ kind: string; item: unknown } | SocialNotificationRow)[],
): SharingNotifications {
  const visible: Required<SharingNotifications> = {
    requests: [],
    accepted: [],
    reactions: [],
    comments: [],
  };
  for (const row of rows as SocialNotificationRow[]) {
    if (row.kind === 'request') visible.requests.push(row.item);
    else if (row.kind === 'accepted') visible.accepted.push(row.item);
    else if (row.kind === 'reaction') visible.reactions.push(row.item);
    else if (row.kind === 'comment') visible.comments.push(row.item);
  }
  return visible;
}

/** The reference that marks a row read, including when it happened. */
export function notificationReference(row: SocialNotificationRow): NotificationReadReference {
  if (row.kind === 'comment')
    return { kind: 'comment', id: row.item.notice_id, since: row.item.since };
  if (row.kind === 'reaction')
    return {
      kind: 'reaction',
      id: row.item.id,
      since: row.item.since,
      workout_id: row.item.workout_id,
    };
  return { kind: row.kind, id: row.item.id, since: row.item.since };
}

/** Identifies a social notice, including when it happened, so a repeat counts as new. */
export function notificationKey(reference: NotificationReadReference): string {
  return `${reference.kind}:${reference.id}:${reference.workout_id ?? ''}:${reference.since}`;
}

/** The bell's count of social notices: waiting friend requests always count, others until read. */
export function socialNotificationCount(items: SharingNotifications | null | undefined): number {
  if (!items) return 0;
  return (
    items.requests.length +
    [...(items.comments ?? []), ...items.accepted, ...(items.reactions ?? [])].filter(
      (item) => !item.is_read,
    ).length
  );
}

/** The bell's spoken name, with the count. */
export function notificationsLabel(count: number): string {
  return `Notifications${count ? `, ${count} unread` : ''}`;
}

/** What a comment notice says happened, and what its spoken link calls it. */
export function commentNoticeText(kind: CommentNotice['kind']): { verb: string; noun: string } {
  if (kind === 'comment_reaction')
    return { verb: ' reacted to your comment on ', noun: 'reaction to your comment' };
  if (kind === 'reply') return { verb: ' replied on ', noun: 'reply' };
  return { verb: ' commented on ', noun: 'comment' };
}

/** A notice's date, such as "14 Nov 2026". */
export function notificationDate(since: string): string {
  return new Date(since).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** The inbox's empty message. */
export const NOTIFICATIONS_EMPTY =
  "You're all caught up. Friend requests, workout reactions, comments and replies appear here.";

/** Every row of the bell's inbox: the app's own notices, then the social ones. */
export type NotificationRow =
  | { kind: 'release'; item: Release }
  | { kind: 'weekly-review'; item: WeeklyReviewNotice }
  | { kind: 'password-reset'; item: PasswordResetRequest }
  | { kind: 'username-reminder'; item: UsernameReminderRequest }
  | SocialNotificationRow;

/** The bell's notices that come from the app rather than from friends. */
export interface AppNoticeRows {
  release?: Release;
  /** The release notice has not been opened yet. */
  releaseUnread?: boolean;
  weeklyReview?: WeeklyReviewNotice | null;
  /** Only loaded for administrators. */
  resetRequests?: PasswordResetRequest[];
  /** Only loaded for administrators. */
  usernameRequests?: UsernameReminderRequest[];
}

/** The start of the day after the reviewed week, when its review became available. */
export function weeklyReviewTime(notice: WeeklyReviewNotice): number {
  const date = new Date(`${notice.weekEnd}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

/**
 * The whole inbox, newest first. The app's own unread notices stay at the top of the first page,
 * above newer social rows.
 */
export function notificationRows(
  items: SharingNotifications,
  {
    release,
    releaseUnread = false,
    weeklyReview,
    resetRequests = [],
    usernameRequests = [],
  }: AppNoticeRows = {},
): NotificationRow[] {
  const rows: NotificationRow[] = [
    ...(release ? [{ kind: 'release' as const, item: release }] : []),
    ...(weeklyReview ? [{ kind: 'weekly-review' as const, item: weeklyReview }] : []),
    ...resetRequests.map((item) => ({ kind: 'password-reset' as const, item })),
    ...usernameRequests.map((item) => ({ kind: 'username-reminder' as const, item })),
    ...socialNotificationRows(items),
  ];
  const timestamp = (row: NotificationRow) => {
    if (row.kind === 'weekly-review') return weeklyReviewTime(row.item);
    return noticeTime(
      row.kind === 'release'
        ? row.item.date
        : row.kind === 'password-reset' || row.kind === 'username-reminder'
          ? row.item.requested_at
          : row.item.since,
    );
  };
  const pinned = (row: NotificationRow) =>
    (row.kind === 'release' && releaseUnread) || (row.kind === 'weekly-review' && row.item.unread);
  return newestFirst(rows, timestamp, pinned);
}

/**
 * The bell's count: waiting friend requests and admin requests always count, until they are dealt
 * with; everything else counts until it has been read.
 */
export function notificationCount(
  items: SharingNotifications | null | undefined,
  { releaseUnread = false, weeklyReview, resetRequests = [], usernameRequests = [] }: AppNoticeRows,
): number {
  return (
    socialNotificationCount(items) +
    Number(releaseUnread) +
    Number(weeklyReview?.unread ?? false) +
    resetRequests.length +
    usernameRequests.length
  );
}

/** What an administrator's notice says the person asked for, after their name. */
export const ADMIN_REQUEST_TEXT = {
  'password-reset': ' asked for a password reset',
  'username-reminder': ' asked for their username',
} as const;

/** Opens the web's admin console at an account, as a password reset alert's link does. */
export const ADMIN_ACCOUNT_PARAM = 'admin-account';

/** The admin console's address for an account waiting for a reset or its username. */
export function adminAccountPath(userId: string): string {
  return `/?${ADMIN_ACCOUNT_PARAM}=${encodeURIComponent(userId)}#admin`;
}
