/**
 * Friend invitation links: a QR code holds an ordinary Relay URL, so it works from any phone
 * camera, with or without the app installed. Opening one while signed out keeps the invitation
 * through signing in or creating an account, then sends the inviter a friend request.
 */

const INVITE_HASH = /^#friend=([A-Za-z0-9-]{1,64})(?:&invite=([^&]*))?$/;
const STORAGE_KEY = 'relay.pendingFriendInvite';
const REGISTRATION_KEY = 'relay.pendingRegistrationInvite';

// Used when session storage is unavailable, as in some private browsing modes.
let memoryInvite: string | null = null;
let memoryRegistrationInvite: string | null = null;

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
export function friendInviteUrl(
  userId: string,
  origin = window.location.origin,
  inviteCode?: string | null,
): string {
  // Keep the code in the fragment: browsers do not send it in requests or referrers.
  const registration = inviteCode ? `&invite=${encodeURIComponent(inviteCode)}` : '';
  return `${origin}/#friend=${encodeURIComponent(userId)}${registration}`;
}

export function friendInviteIdFromHash(hash: string): string | null {
  return INVITE_HASH.exec(hash)?.[1] ?? null;
}

function registrationInviteFromHash(hash: string): string | null {
  const encoded = INVITE_HASH.exec(hash)?.[2];
  if (!encoded) return null;
  try {
    const code = decodeURIComponent(encoded);
    return code.length <= 200 ? code : null;
  } catch {
    return null;
  }
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
  memoryRegistrationInvite = registrationInviteFromHash(location.hash);
  try {
    // An empty value replaces any registration code from an earlier friend's link.
    (storage ?? window.sessionStorage).setItem(REGISTRATION_KEY, memoryRegistrationInvite ?? '');
  } catch {
    // The current page can still pre-fill the code when session storage is blocked.
  }
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

export function pendingRegistrationInvite(storage?: Pick<Storage, 'getItem'>): string | null {
  try {
    const code = (storage ?? window.sessionStorage).getItem(REGISTRATION_KEY);
    return code && code.length <= 200 ? code : null;
  } catch {
    return memoryRegistrationInvite;
  }
}

export function clearFriendInvite(storage?: Pick<Storage, 'removeItem'>) {
  memoryInvite = null;
  memoryRegistrationInvite = null;
  try {
    (storage ?? window.sessionStorage).removeItem(STORAGE_KEY);
    (storage ?? window.sessionStorage).removeItem(REGISTRATION_KEY);
  } catch {
    // Nothing stored.
  }
}

/** Dispatched on window when a code scanned inside the app has stored a new invitation. */
export const FRIEND_INVITE_EVENT = 'relay:friend-invite';

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

/** Starts the same flow as opening an invite link, for a code scanned inside the app. */
export function openFriendInvite(id: string, storage?: Pick<Storage, 'setItem'>) {
  try {
    (storage ?? window.sessionStorage).setItem(STORAGE_KEY, id);
  } catch {
    memoryInvite = id;
  }
  window.dispatchEvent(new Event(FRIEND_INVITE_EVENT));
}
