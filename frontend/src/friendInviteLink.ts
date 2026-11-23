/**
 * The friend link a QR code holds: an ordinary Relay URL ending in `#friend=<account id>`, so it
 * works from any phone camera, with or without the app. The web and the app make and read the
 * same links, so every printed or shown code keeps working in both.
 */

export const FRIEND_INVITE_HASH = /^#friend=([A-Za-z0-9-]{1,64})(?:&invite=([^&]*))?$/;

/** The link a member's QR code opens. The account id never changes, unlike the username. */
export function friendInviteLink(
  userId: string,
  origin: string,
  inviteCode?: string | null,
): string {
  // Keep the code in the fragment: browsers do not send it in requests or referrers.
  const registration = inviteCode ? `&invite=${encodeURIComponent(inviteCode)}` : '';
  return `${origin}/#friend=${encodeURIComponent(userId)}${registration}`;
}

export function friendInviteIdFromHash(hash: string): string | null {
  return FRIEND_INVITE_HASH.exec(hash)?.[1] ?? null;
}

/**
 * Reads a scanned QR code as a friend link. Any Relay address is accepted, so a code made on
 * another of this server's addresses still works; an unknown account simply cannot be opened.
 */
export function friendInviteIdFromScan(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return friendInviteIdFromHash(url.hash);
}
