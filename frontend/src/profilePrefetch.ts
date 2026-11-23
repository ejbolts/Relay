import { byLiveActivity } from './presenceStatus';
import type { FriendActivity } from './types';

// Which friends' profiles load in the background while Social's feed is on screen, so opening
// one of the first few is instant. Shared by the web and the app.

/** Friends warmed in the background from the start of the feed's row of friends. */
export const PREFETCH_LIMIT = 5;
/**
 * Background warming leaves a copy alone until it is this old or the friend logs a session, and
 * the first profiles are warmed again this often while the feed stays open.
 */
export const PREFETCH_REFRESH_MS = 5 * 60_000;

/** Changes when a friend logs a session, so their background copy is loaded again. */
export function profileSignature(
  friend: Pick<FriendActivity, 'latest' | 'recent_workout_count'>,
): string {
  return `${friend.latest?.workout.id ?? ''}:${friend.recent_workout_count}`;
}

/** The profiles to warm: the first few in the row's order (training now, then online). */
export function profilePrefetchTargets(
  friends: FriendActivity[],
  limit = PREFETCH_LIMIT,
): { id: string; signature: string }[] {
  return byLiveActivity(friends, (friend) => friend.presence)
    .slice(0, limit)
    .map((friend) => ({ id: friend.id, signature: profileSignature(friend) }));
}

/** Whether a background copy can be kept rather than loaded again. */
export function prefetchedCopyIsCurrent(
  copy: { fetchedAt: number; signature: string | null } | null | undefined,
  signature: string | null,
  now: number,
): boolean {
  return (
    !!copy &&
    now - copy.fetchedAt < PREFETCH_REFRESH_MS &&
    (signature === null || copy.signature === signature)
  );
}
