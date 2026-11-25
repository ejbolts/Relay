import { api, ApiError } from './api';
import { parseTips, tipStorageKey, type TipState } from './tipsState';
import { TIP_ACCOUNT_MISMATCH, TIP_SYNC_REFUSED, TipSyncBusy } from './tipSync';

/** The web keeps each account's tips in this browser's localStorage. */
export function loadTips(account: string): TipState {
  try {
    return parseTips(localStorage.getItem(tipStorageKey(account)));
  } catch {
    return parseTips(null);
  }
}

/** The account's tips as last saved in this browser by any tab, or null when there are none. */
export function loadSavedTips(account: string): TipState | null {
  try {
    const raw = localStorage.getItem(tipStorageKey(account));
    return raw === null ? null : parseTips(raw);
  } catch {
    return null;
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
 * Saves the account's tips from this browser and resolves with the server's reply; with null when
 * the server predates the tip store; or with TIP_SYNC_REFUSED when the browser is now signed in to
 * another account (a stale tab), which keeps changes here until the account is back. A busy server
 * throws TipSyncBusy, for the sync to retry.
 */
export async function sendTips(
  account: string,
  state: TipState,
  generation: string,
): Promise<unknown> {
  try {
    return await api.saveTipState(state, account, generation);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.code === TIP_ACCOUNT_MISMATCH) return TIP_SYNC_REFUSED;
    if (error.status === 404 || error.status === 405) return null;
    if (error.status === 503 || error.status === 429) throw new TipSyncBusy();
    throw error;
  }
}

const holdKey = (account: string) => `relay:tips:sync-hold:v1:${account}`;

/**
 * A nudge's rollback window, shared by this browser's tabs: its showing is already in the tips
 * every tab reads, so none of them may save it to the account until the window ends.
 */
export function holdTipSync(account: string, until: number) {
  try {
    if (until > loadTipSyncHold(account)) localStorage.setItem(holdKey(account), String(until));
  } catch {
    /* Without storage there are no other tabs to hold. */
  }
}

export function loadTipSyncHold(account: string): number {
  try {
    const until = Number(localStorage.getItem(holdKey(account)));
    return Number.isFinite(until) ? until : 0;
  } catch {
    return 0;
  }
}
