/**
 * Friend invitation links: a QR code holds an ordinary Relay URL, so it works from any phone
 * camera, with or without the app installed. Opening one while signed out keeps the invitation
 * through signing in or creating an account, then opens the inviter's profile.
 */

const INVITE_HASH = /^#friend=([A-Za-z0-9-]{1,64})$/;
const STORAGE_KEY = 'relay.pendingFriendInvite';

// Used when session storage is unavailable, as in some private browsing modes.
let memoryInvite: string | null = null;

interface InviteLocation {
  hash: string;
  pathname: string;
  search: string;
}

interface InviteHistory {
  state: unknown;
  replaceState: (data: unknown, unused: string, url?: string) => void;
}

/** The link a member's QR code opens. The account id never changes, unlike the username. */
export function friendInviteUrl(userId: string, origin = window.location.origin): string {
  return `${origin}/#friend=${encodeURIComponent(userId)}`;
}

export function friendInviteIdFromHash(hash: string): string | null {
  return INVITE_HASH.exec(hash)?.[1] ?? null;
}

/**
 * Moves an invitation from the address bar into this tab's storage, so it survives signing in
 * and reloads, and the app's own screen links take over the address bar.
 */
export function captureFriendInvite(
  location: InviteLocation = window.location,
  history: InviteHistory = window.history,
  storage?: Pick<Storage, 'setItem'>,
): string | null {
  const id = friendInviteIdFromHash(location.hash);
  if (!id) return null;
  try {
    (storage ?? window.sessionStorage).setItem(STORAGE_KEY, id);
  } catch {
    memoryInvite = id;
  }
  history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  return id;
}

export function pendingFriendInvite(storage?: Pick<Storage, 'getItem'>): string | null {
  try {
    const id = (storage ?? window.sessionStorage).getItem(STORAGE_KEY);
    if (id && INVITE_HASH.test(`#friend=${id}`)) return id;
  } catch {
    // Fall back to an invitation kept in memory.
  }
  return memoryInvite;
}

export function clearFriendInvite(storage?: Pick<Storage, 'removeItem'>) {
  memoryInvite = null;
  try {
    (storage ?? window.sessionStorage).removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}
