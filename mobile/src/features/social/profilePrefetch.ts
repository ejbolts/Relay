import { onlineManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import {
  PREFETCH_REFRESH_MS,
  prefetchedCopyIsCurrent,
  profilePrefetchTargets,
} from '../../../../frontend/src/profilePrefetch';
import type { FriendActivity } from '../../../../frontend/src/types';
import { useUser } from '../../session/SessionProvider';
import { sharedProfileQuery, sharedWorkoutsQuery } from './socialQueries';

// The first few friends' profiles load in the background while Social's feed is on screen, so
// opening one is instant, as on the web. Which friends, and when a copy is reloaded, are the
// web's rules (see frontend/src/profilePrefetch.ts).

type Target = { id: string; signature: string };

/** Runs work once the app is idle, or shortly after where idle callbacks aren't available. */
const idle =
  typeof requestIdleCallback === 'function'
    ? {
        start: (run: () => void): unknown => requestIdleCallback(run, { timeout: 2000 }),
        stop: (handle: unknown) => cancelIdleCallback(handle as number),
      }
    : {
        start: (run: () => void): unknown => setTimeout(run, 250),
        stop: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      };

/** When each profile was last warmed, and the friend's activity then, for the signed-in account. */
const copies = new Map<string, { fetchedAt: number; signature: string | null }>();

/** Loads one profile and its newest workouts into the cache, unless a current copy is there. */
export async function prefetchProfile(client: QueryClient, viewer: string, target: Target) {
  const key = `${viewer}:${target.id}`;
  const copy = copies.get(key);
  // Signing out clears the cache, so a copy only counts while its data is still there.
  const cached = client.getQueryData(sharedProfileQuery(target.id).queryKey) !== undefined;
  if (cached && prefetchedCopyIsCurrent(copy, target.signature, Date.now())) return;
  if (!onlineManager.isOnline() || AppState.currentState === 'background') return;
  // A friend who has logged a session since is read again; otherwise a recent copy is kept.
  const staleTime = copy && copy.signature !== target.signature ? 0 : PREFETCH_REFRESH_MS;
  try {
    await Promise.all([
      client.prefetchQuery({ ...sharedProfileQuery(target.id), staleTime }),
      client.prefetchInfiniteQuery({ ...sharedWorkoutsQuery(target.id), staleTime }),
    ]);
    copies.set(key, { fetchedAt: Date.now(), signature: target.signature });
  } catch {
    // Opening the profile loads it as usual.
  }
}

/**
 * Warms the targets one at a time while the app is idle, so it never competes with what is on
 * screen. Returns a function that stops the rest.
 */
function prefetchProfiles(client: QueryClient, viewer: string, targets: Target[]): () => void {
  let stopped = false;
  const queue = [...targets];
  let handle: ReturnType<typeof idle.start> | null = null;
  function next() {
    handle = null;
    const target = queue.shift();
    if (stopped || !target) return;
    void prefetchProfile(client, viewer, target).then(() => {
      if (!stopped && queue.length) handle = idle.start(next);
    });
  }
  handle = idle.start(next);
  return () => {
    stopped = true;
    if (handle !== null) idle.stop(handle);
  };
}

/**
 * While `active` (the feed is in front), loads the first friends' profiles in the background and
 * refreshes them every few minutes.
 */
export function usePrefetchFriendProfiles(friends: FriendActivity[] | null, active: boolean) {
  const client = useQueryClient();
  const viewer = useUser().id;
  const key = JSON.stringify(friends ? profilePrefetchTargets(friends) : []);
  useEffect(() => {
    if (!active) return;
    const targets = JSON.parse(key) as Target[];
    if (!targets.length) return;
    let stop = prefetchProfiles(client, viewer, targets);
    const timer = setInterval(() => {
      stop();
      stop = prefetchProfiles(client, viewer, targets);
    }, PREFETCH_REFRESH_MS);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [active, key, client, viewer]);
}
