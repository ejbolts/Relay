import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { authErrorMessage } from './authForm';
import type { TimelineItem } from './types';

const PAGE_SIZE = 10;
/** The most workouts one request returns; a longer feed refreshes only its newest part. */
const MAX_PAGE_SIZE = 50;
const REFRESH_MS = 60_000;

export type TimelineState = 'loading' | 'ready' | 'locked' | 'error';

function withoutRepeats(items: TimelineItem[]): TimelineItem[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.workout.id) && seen.add(item.workout.id));
}

/**
 * Social's feed, a page at a time. While `active` it reloads on focus, when the app is shown
 * again or comes back online, and every minute, so new sessions and reactions appear. With
 * `preload`, the first page is read once in the background before the feed is first shown.
 */
export function useTimeline(active: boolean, preload = false) {
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<TimelineState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [version, setVersion] = useState(0);
  const shown = useRef(0);
  shown.current = items?.length ?? 0;
  const settled = useRef(false);

  useEffect(() => {
    // A background read happens once; refreshing waits until the feed is shown.
    if (!active && (!preload || settled.current)) return;
    let cancelled = false;
    let request = 0;
    function load() {
      if (document.visibilityState === 'hidden') return;
      const current = ++request;
      const size = Math.min(MAX_PAGE_SIZE, Math.max(PAGE_SIZE, shown.current));
      api.sharing
        .timeline(0, size)
        .then((page) => {
          if (cancelled || current !== request) return;
          settled.current = true;
          setItems((existing) => {
            // Workouts beyond the reloaded part stay as they were.
            const kept = existing && existing.length > size ? existing.slice(size) : [];
            if (!kept.length) setHasMore(page.has_more);
            return withoutRepeats([...page.items, ...kept]);
          });
          setState('ready');
          setError(null);
        })
        .catch((reason: unknown) => {
          if (cancelled || current !== request) return;
          settled.current = true;
          if (reason instanceof ApiError && reason.code === 'sharing_required') {
            setItems(null);
            setState('locked');
            return;
          }
          // Keep the last feed on screen; a failed refresh only matters without one.
          setState('error');
          setError(authErrorMessage(reason));
        });
    }
    load();
    if (!active) {
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setInterval(load, REFRESH_MS);
    window.addEventListener('focus', load);
    window.addEventListener('online', load);
    document.addEventListener('visibilitychange', load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', load);
      window.removeEventListener('online', load);
      document.removeEventListener('visibilitychange', load);
    };
  }, [active, preload, version]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    setError(null);
    try {
      const page = await api.sharing.timeline(shown.current, PAGE_SIZE);
      setItems((existing) => withoutRepeats([...(existing ?? []), ...page.items]));
      setHasMore(page.has_more);
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setLoadingMore(false);
    }
  }, []);

  const update = useCallback(
    (workoutId: string, change: (item: TimelineItem) => TimelineItem) =>
      setItems(
        (existing) =>
          existing && existing.map((item) => (item.workout.id === workoutId ? change(item) : item)),
      ),
    [],
  );

  return { items, hasMore, state, error, loadingMore, refresh, loadMore, update };
}
