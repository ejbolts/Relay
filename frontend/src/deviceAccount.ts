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
