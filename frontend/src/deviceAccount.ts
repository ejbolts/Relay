import type { User } from './types';

/** Remembers which account last used this device so a different account never sees its data. */
export const LAST_USER_KEY = 'gym-logger-last-user';

export interface AccountStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function browserAccountStorage(): AccountStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The account that last signed in on this device, kept so the app can start while offline. */
export function readLastUser(
  storage: AccountStorage | null = browserAccountStorage(),
): User | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(LAST_USER_KEY) ?? 'null') as Partial<User> | null;
    return parsed && typeof parsed.id === 'string' && typeof parsed.display_name === 'string'
      ? (parsed as User)
      : null;
  } catch {
    return null;
  }
}

export function rememberUser(user: User, storage = browserAccountStorage()) {
  try {
    storage?.setItem(LAST_USER_KEY, JSON.stringify(user));
  } catch {
    // Storage can be unavailable or full; the cleanup check just runs again next time.
  }
}

/**
 * The account whose session ended without signing out on this device, such as after "Sign out
 * everywhere" on another device. Its unsynced workout waits on this device for it to sign in
 * again, and the sign-in form starts with its username.
 */
export const SIGNED_OUT_ACCOUNT_KEY = 'relay.signed-out-account';

export type SignedOutAccount = Pick<User, 'id' | 'username'>;

export function readSignedOutAccount(
  storage: AccountStorage | null = browserAccountStorage(),
): SignedOutAccount | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(
      storage.getItem(SIGNED_OUT_ACCOUNT_KEY) ?? 'null',
    ) as Partial<SignedOutAccount> | null;
    return parsed && typeof parsed.id === 'string' && typeof parsed.username === 'string'
      ? { id: parsed.id, username: parsed.username }
      : null;
  } catch {
    return null;
  }
}

export function rememberSignedOutAccount(
  account: SignedOutAccount | null,
  storage: AccountStorage | null = browserAccountStorage(),
): void {
  try {
    if (account)
      storage?.setItem(
        SIGNED_OUT_ACCOUNT_KEY,
        JSON.stringify({ id: account.id, username: account.username }),
      );
    else storage?.removeItem(SIGNED_OUT_ACCOUNT_KEY);
  } catch {
    // Without storage the sign-in form simply starts empty.
  }
}
