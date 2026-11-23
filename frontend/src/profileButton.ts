import type { SharingSettings } from './types';

// The header's profile button: its waiting-requests badge and spoken label, shared by the web
// and the app.

/** Friend requests waiting for an answer. A private profile can't receive any. */
export function pendingFriendRequests(
  settings: Pick<SharingSettings, 'visibility' | 'pending_requests'>,
): number {
  return settings.visibility === 'private' ? 0 : settings.pending_requests;
}

/** The badge's text for `count` waiting items, or null when nothing is waiting. */
export function profileBadgeText(count: number): string | null {
  if (count <= 0) return null;
  return count > 9 ? '9+' : String(count);
}

/** The profile button's label, including friend requests and feedback waiting for review. */
export function profileButtonLabel(
  name: string | undefined,
  friendRequests: number,
  openFeedback: number,
): string {
  const waiting = [
    friendRequests > 0 &&
      `${friendRequests} friend ${friendRequests === 1 ? 'request' : 'requests'}`,
    openFeedback > 0 &&
      `${openFeedback} feedback ${openFeedback === 1 ? 'message' : 'messages'} to review`,
  ].filter(Boolean);
  return [name ? `Profile: ${name}` : 'Profile', ...waiting].join(', ');
}
