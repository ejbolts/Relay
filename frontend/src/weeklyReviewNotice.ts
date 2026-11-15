import { useSyncExternalStore } from 'react';

/** Last week's review, as listed in the notifications inbox until the next week begins. */
export interface WeeklyReviewNotice {
  /** First day of the reviewed week. */
  weekStart: string;
  /** Last day of the reviewed week. */
  weekEnd: string;
  /** False once the review popup has been shown for this week. */
  unread: boolean;
}

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
