import Storage from 'expo-sqlite/kv-store';
import type { DraftStorage } from '../../../frontend/src/workoutDraft';

/**
 * The phone's durable key-value store (SQLite), read and written synchronously, so the live
 * workout is on disk before the next frame and survives the app being killed. It takes the same
 * keys and formats the web keeps in localStorage (see frontend/src/workoutDraft.ts).
 */
export const deviceStorage: DraftStorage = {
  getItem: (key) => Storage.getItemSync(key),
  setItem: (key, value) => Storage.setItemSync(key, value),
  removeItem: (key) => {
    Storage.removeItemSync(key);
  },
};

/** Reads a JSON value, or null when it is missing or unreadable. */
export function readJson<T>(key: string): T | null {
  try {
    const value = deviceStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

/** Writes a JSON value (null removes it); false when storage refuses. */
export function writeJson(key: string, value: unknown): boolean {
  try {
    if (value === null || value === undefined) deviceStorage.removeItem(key);
    else deviceStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** A random version 4 UUID, the format the draft and the server expect for session ids. */
export function newId(): string {
  const native = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof native?.randomUUID === 'function') return native.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16));
  hex[12] = 4;
  hex[16] = (hex[16] & 0x3) | 0x8;
  const text = hex.map((digit) => digit.toString(16)).join('');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}
