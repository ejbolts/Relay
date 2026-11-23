import type {
  CommentNotice,
  NotificationReadReference,
  ReactionNotice,
  SharingConnection,
  SharingNotifications,
} from './types';

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
