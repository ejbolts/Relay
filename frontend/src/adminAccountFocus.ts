import { useSyncExternalStore } from 'react';

/** An account to reveal in the admin console, such as one opened from a notification. */
export interface AdminAccountFocus {
  userId: string;
  /** Distinguishes repeated requests for the same account. */
  key: number;
}

/** The account card's element id in the admin console. */
export function adminUserRowId(userId: string): string {
  return `admin-user-${userId}`;
}

/** Set by a password reset phone alert's link, such as /?admin-account=<id>#admin. */
export const ADMIN_ACCOUNT_PARAM = 'admin-account';

/** The account a tapped phone alert asked to open, removed from the address once read. */
export function takeAdminAccountFromUrl(): string | null {
  const url = new URL(window.location.href);
  const userId = url.searchParams.get(ADMIN_ACCOUNT_PARAM);
  if (userId === null) return null;
  url.searchParams.delete(ADMIN_ACCOUNT_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return userId || null;
}

let current: AdminAccountFocus | null = null;
let sequence = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Opens the admin console at an account. The request waits until the console has handled it. */
export function requestAdminAccountFocus(userId: string): void {
  current = { userId, key: ++sequence };
  listeners.forEach((listener) => listener());
}

/** Marks a request handled, unless a newer one has replaced it. */
export function clearAdminAccountFocus(key: number): void {
  if (current?.key !== key) return;
  current = null;
  listeners.forEach((listener) => listener());
}

const snapshot = () => current;
const serverSnapshot = () => null;

/** The waiting request, if any. */
export function useAdminAccountFocus(): AdminAccountFocus | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Runs when a request arrives, for the app to switch to the admin console. */
export function onAdminAccountFocusRequested(listener: () => void): () => void {
  const notify = () => {
    if (current) listener();
  };
  listeners.add(notify);
  return () => listeners.delete(notify);
}
