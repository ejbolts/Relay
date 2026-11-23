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
