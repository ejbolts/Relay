import { api, ApiError } from './api';
import { parseTips, tipStorageKey, type TipState } from './tipsState';

/** The web keeps each account's tips in this browser's localStorage. */
export function loadTips(account: string): TipState {
  try {
    return parseTips(localStorage.getItem(tipStorageKey(account)));
  } catch {
    return parseTips(null);
  }
}

export function saveTips(account: string, state: TipState) {
  try {
    localStorage.setItem(tipStorageKey(account), JSON.stringify(state));
  } catch {
    /* In-memory state still works when storage is unavailable. */
  }
}

/**
 * Saves this browser's tips to the account and resolves with the merged copy, or with null when
 * the server predates the tip store.
 */
export async function sendTips(state: TipState): Promise<unknown> {
  try {
    return await api.saveTipState(state);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405)) return null;
    throw error;
  }
}
