import { useSyncExternalStore } from 'react';
import {
  releaseNoticeReadKey,
  releaseSeenKey,
  storedReviewWeek,
  weeklyReviewShownKey,
} from '../../../../frontend/src/appNoticeRules';
import type { LaunchPrompt } from '../../../../frontend/src/launchPrompts';
import { deviceStorage } from '../../data/deviceStorage';

/**
 * What this phone remembers about the one-off notices, under the web's keys: which releases'
 * What's new it has closed and notices it has opened, and the week whose review it last showed.
 * A value the phone can't store still holds until the app is closed.
 */
const session = new Map<string, string>();
const listeners = new Set<() => void>();
let revision = 0;

function read(key: string): string | null {
  const remembered = session.get(key);
  if (remembered !== undefined) return remembered;
  try {
    return deviceStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  if (read(key) === value) return;
  session.set(key, value);
  try {
    deviceStorage.setItem(key, value);
  } catch {
    // Kept for this visit only.
  }
  revision += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders when anything here changes; read the values with the functions below. */
export function useNoticeMemory(): number {
  return useSyncExternalStore(subscribe, () => revision);
}

export const hasSeenRelease = (userId: string, version: string) =>
  read(releaseSeenKey(userId, version)) === '1';

export const rememberRelease = (userId: string, version: string) =>
  write(releaseSeenKey(userId, version), '1');

export const hasReadReleaseNotice = (userId: string, version: string) =>
  read(releaseNoticeReadKey(userId, version)) === '1';

export const rememberReleaseNoticeRead = (userId: string, version: string) =>
  write(releaseNoticeReadKey(userId, version), '1');

export const weeklyReviewShownFor = (userId: string) =>
  storedReviewWeek(read(weeklyReviewShownKey(userId)));

export const markWeeklyReviewShown = (userId: string, weekStart: string) =>
  write(weeklyReviewShownKey(userId), weekStart);

/**
 * The prompt that opened by itself during this visit, per account. Only one does (see
 * frontend/src/launchPrompts.ts); the rest wait for the next time the app is opened.
 */
let launchPrompt: { userId: string; prompt: LaunchPrompt } | null = null;

export function launchPromptOpened(userId: string): LaunchPrompt | null {
  return launchPrompt?.userId === userId ? launchPrompt.prompt : null;
}

export function openLaunchPrompt(userId: string, prompt: LaunchPrompt) {
  launchPrompt = { userId, prompt };
}

/** Forgets the visit's prompt, for tests. */
export function resetLaunchPrompt() {
  launchPrompt = null;
}
