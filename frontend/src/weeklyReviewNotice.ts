import { useSyncExternalStore } from 'react';
import type { WeeklyReviewNotice } from './weeklyReview';

export type { WeeklyReviewNotice } from './weeklyReview';

let current: WeeklyReviewNotice | null = null;
const noticeListeners = new Set<() => void>();
const openListeners = new Set<() => void>();

function same(a: WeeklyReviewNotice | null, b: WeeklyReviewNotice | null): boolean {
  return (
    a === b ||
    (!!a && !!b && a.weekStart === b.weekStart && a.weekEnd === b.weekEnd && a.unread === b.unread)
  );
}

export function publishWeeklyReviewNotice(next: WeeklyReviewNotice | null): void {
  if (same(current, next)) return;
  current = next;
  noticeListeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  noticeListeners.add(listener);
  return () => noticeListeners.delete(listener);
}

export function useWeeklyReviewNotice(): WeeklyReviewNotice | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

/** Asks the mounted weekly review prompt to open its popup. */
export function requestWeeklyReview(): void {
  openListeners.forEach((listener) => listener());
}

export function onWeeklyReviewRequested(listener: () => void): () => void {
  openListeners.add(listener);
  return () => openListeners.delete(listener);
}
