import type { NotificationReadReference, SharingNotifications } from './types';
export function unreadNotificationReferences(
  items: SharingNotifications,
): NotificationReadReference[] {
  return [
    ...(items.comments ?? [])
      .filter((item) => !item.is_read)
      .map((item) => ({ kind: 'comment' as const, id: item.notice_id, since: item.since })),
    ...items.requests
      .filter((item) => !item.is_read)
      .map((item) => ({ kind: 'request' as const, id: item.id, since: item.since })),
    ...items.accepted
      .filter((item) => !item.is_read)
      .map((item) => ({ kind: 'accepted' as const, id: item.id, since: item.since })),
    ...(items.reactions ?? [])
      .filter((item) => !item.is_read)
      .map((item) => ({
        kind: 'reaction' as const,
        id: item.id,
        since: item.since,
        workout_id: item.workout_id,
      })),
  ];
}
/** Apply only acknowledged events so newer notifications retain their unread badge. */
export function markNotificationSnapshotRead(
  items: SharingNotifications,
  sent: NotificationReadReference[],
): SharingNotifications {
  const matches = (
    kind: NotificationReadReference['kind'],
    id: string,
    since: string,
    workoutId?: string,
  ) =>
    sent.some(
      (item) =>
        item.kind === kind &&
        item.id === id &&
        item.since === since &&
        item.workout_id === workoutId,
    );
  return {
    comments: items.comments?.map((item) =>
      matches('comment', item.notice_id, item.since) ? { ...item, is_read: true } : item,
    ),
    requests: items.requests.map((item) =>
      matches('request', item.id, item.since) ? { ...item, is_read: true } : item,
    ),
    accepted: items.accepted.map((item) =>
      matches('accepted', item.id, item.since) ? { ...item, is_read: true } : item,
    ),
    reactions: items.reactions?.map((item) =>
      matches('reaction', item.id, item.since, item.workout_id) ? { ...item, is_read: true } : item,
    ),
  };
}
