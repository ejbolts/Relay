import { useSyncExternalStore } from 'react';
import { TRAIN_INVITE_SECONDS } from '../../../../frontend/src/trainTogether';
import { readJson, writeJson } from '../../data/deviceStorage';

// A train-together code waiting to be joined: from a link that opened the app (kept through
// Sign in), or from a scanner outside the Train together sheet. The signed-in host joins it.
// A code lasts five minutes on the server, so a kept one older than that is dropped unused.

const KEY = 'relay.pendingTrainInvite';
const MAX_AGE_MS = TRAIN_INVITE_SECONDS * 1000;

export interface PendingTrainInvite {
  token: string;
  /** When it arrived, in ms. */
  at: number;
}

const listeners = new Set<() => void>();
let pending: PendingTrainInvite | null | undefined;

function valid(value: unknown): PendingTrainInvite | null {
  const item = value as Partial<PendingTrainInvite> | null;
  return item &&
    typeof item.token === 'string' &&
    /^[A-Za-z0-9_-]{16,64}$/.test(item.token) &&
    typeof item.at === 'number' &&
    Number.isFinite(item.at)
    ? { token: item.token, at: item.at }
    : null;
}

const current = () => {
  if (pending === undefined) pending = valid(readJson<PendingTrainInvite>(KEY));
  // A code past its five minutes can't be used: it isn't kept.
  if (pending && Date.now() - pending.at > MAX_AGE_MS) {
    pending = null;
    writeJson(KEY, null);
  }
  return pending;
};

function save(next: PendingTrainInvite | null) {
  pending = next;
  writeJson(KEY, next);
  listeners.forEach((listener) => listener());
}

/** Keeps a code to join once signed in (a link, or a scan outside the sheet). */
export function requestTrainJoin(token: string, now = Date.now()) {
  if (!valid({ token, at: now })) return;
  save({ token, at: now });
}

/** The kept code, if it is still within its five minutes. */
export function pendingTrainInvite(): PendingTrainInvite | null {
  return current();
}

/** Forgets a kept code, as signing out does. */
export function clearPendingTrainInvite() {
  if (current()) save(null);
}

/** Takes the kept code to join, or null; a code older than five minutes is dropped. */
export function takePendingTrainInvite(now = Date.now()): string | null {
  const item = current();
  if (!item) return null;
  save(null);
  return now - item.at <= MAX_AGE_MS && item.at <= now + 60_000 ? item.token : null;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The kept code, so the host joins it once it can. */
export function usePendingTrainInvite(): PendingTrainInvite | null {
  return useSyncExternalStore(subscribe, current);
}
