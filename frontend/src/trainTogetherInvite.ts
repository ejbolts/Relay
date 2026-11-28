/**
 * Train-together invite links: `/#train=<token>` in the address bar is captured before the app
 * reads its screen hash, survives signing in, and is dropped once older than 5 minutes.
 */

import { TRAIN_INVITE_HASH, TRAIN_INVITE_SECONDS, trainInviteTokenFromHash } from './trainTogether';

export {
  trainInviteLink,
  trainInviteTokenFromHash,
  trainInviteTokenFromScan,
} from './trainTogether';

/** Dispatched on `window` when the presence socket signals a train-together change or reconnects. */
export const TRAIN_TOGETHER_CHANGED = 'relay:train-together-changed';

/** Dispatched on `window` when a train-together code is scanned inside the app. */
export const TRAIN_INVITE_EVENT = 'relay:train-invite';

const STORAGE_KEY = 'relay.pendingTrainInvite';
const MAX_AGE_MS = TRAIN_INVITE_SECONDS * 1000;

interface StoredTrainInvite {
  token: string;
  capturedAt: number;
}

let memoryInvite: StoredTrainInvite | null = null;
const inFlightTokens = new Set<string>();

interface InviteLocation {
  hash: string;
  pathname: string;
  search: string;
}

interface InviteHistory {
  state: unknown;
  replaceState: (data: unknown, unused: string, url?: string) => void;
}

function validToken(token: unknown): token is string {
  return typeof token === 'string' && TRAIN_INVITE_HASH.test(`#train=${token}`);
}

function writeStoredInvite(entry: StoredTrainInvite, storage?: Pick<Storage, 'setItem'>): void {
  memoryInvite = entry;
  try {
    (storage ?? window.sessionStorage).setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Keep the invite in memory when session storage is blocked.
  }
}

export function clearTrainInvite(storage?: Pick<Storage, 'removeItem'>): void {
  memoryInvite = null;
  try {
    (storage ?? window.sessionStorage).removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}

/**
 * Moves a `#train=<token>` invite from the address bar into tab storage so it survives sign-in,
 * clearing the fragment from the URL.
 */
export function captureTrainInvite(
  location: InviteLocation = window.location,
  history: InviteHistory = window.history,
  storage?: Pick<Storage, 'setItem'>,
  now = Date.now(),
): string | null {
  const token = trainInviteTokenFromHash(location.hash);
  if (!token) return null;
  writeStoredInvite({ token, capturedAt: now }, storage);
  history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  return token;
}

/** Returns the pending train-together token, dropping it once older than 5 minutes. */
export function pendingTrainInvite(
  storage?: Pick<Storage, 'getItem' | 'removeItem'>,
  now = Date.now(),
): string | null {
  let entry: StoredTrainInvite | null = null;
  try {
    const raw = (storage ?? window.sessionStorage).getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredTrainInvite>;
      if (validToken(parsed.token) && typeof parsed.capturedAt === 'number') {
        entry = { token: parsed.token, capturedAt: parsed.capturedAt };
      }
    }
  } catch {
    entry = memoryInvite;
  }
  if (!entry && memoryInvite && validToken(memoryInvite.token)) {
    entry = memoryInvite;
  }
  if (!entry) return null;
  if (now - entry.capturedAt > MAX_AGE_MS) {
    clearTrainInvite(storage);
    return null;
  }
  return entry.token;
}

/**
 * Atomically reads and clears the pending train-together token, checking its 5-minute age at
 * consumption time. Returns null when missing or expired.
 */
export function takePendingTrainInvite(
  storage?: Pick<Storage, 'getItem' | 'removeItem'>,
  now = Date.now(),
): string | null {
  const token = pendingTrainInvite(storage, now);
  if (!token) return null;
  clearTrainInvite(storage);
  return token;
}

/** Guards against submitting the same invite token concurrently (e.g. StrictMode double mount). */
export function claimTrainInviteToken(token: string): boolean {
  if (inFlightTokens.has(token)) return false;
  inFlightTokens.add(token);
  return true;
}

export function releaseTrainInviteToken(token: string): void {
  inFlightTokens.delete(token);
}

/** Hands a scanned train-together token to the app's join path. */
export function openTrainInvite(
  token: string,
  storage?: Pick<Storage, 'setItem'>,
  now = Date.now(),
): void {
  if (!validToken(token)) return;
  writeStoredInvite({ token, capturedAt: now }, storage);
  window.dispatchEvent(new Event(TRAIN_INVITE_EVENT));
}

let hashCaptureRefCount = 0;
let hashCaptureListener: (() => void) | null = null;

/**
 * Keeps `#train=<token>` fragment capture active for the lifetime of the page, including while
 * signed out on the sign-in screen. Ref-counted so multiple callers share one listener cleanly.
 */
export function installTrainInviteHashCapture(): () => void {
  hashCaptureRefCount += 1;
  if (!hashCaptureListener) {
    hashCaptureListener = () => {
      const token = captureTrainInvite();
      if (token) window.dispatchEvent(new Event(TRAIN_INVITE_EVENT));
    };
    window.addEventListener('hashchange', hashCaptureListener);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    hashCaptureRefCount = Math.max(0, hashCaptureRefCount - 1);
    if (hashCaptureRefCount === 0 && hashCaptureListener) {
      window.removeEventListener('hashchange', hashCaptureListener);
      hashCaptureListener = null;
    }
  };
}
