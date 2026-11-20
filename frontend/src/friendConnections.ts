import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { authErrorMessage } from './authForm';
import { onFriendPresence } from './presence';
import type { FriendConnections, WorkoutReactions } from './types';

export type FriendConnectionsState = 'loading' | 'ready' | 'locked' | 'error';

/**
 * Friends, requests and blocks for Social, refreshed while `active`: on focus, when the app is
 * shown again or comes back online, and every 30 seconds. Friends' live activity updates as soon
 * as the presence connection reports it. With `preload`, the list is read once in the background
 * before Social is first opened, so it opens without waiting.
 */
export function useFriendConnections(active: boolean, preload = false) {
  const [connections, setConnections] = useState<FriendConnections | null>(null);
  const [state, setState] = useState<FriendConnectionsState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const settled = useRef(false);

  useEffect(() => {
    // A background read happens once; refreshing waits until the screen is shown.
    if (!active && (!preload || settled.current)) return;
    let cancelled = false;
    let request = 0;
    function load() {
      if (document.visibilityState === 'hidden') return;
      const current = ++request;
      api.sharing
        .friends()
        .then((next) => {
          if (cancelled || current !== request) return;
          settled.current = true;
          setConnections(next);
          setState(next.locked ? 'locked' : 'ready');
          setError(null);
        })
        .catch((reason: unknown) => {
          if (cancelled || current !== request) return;
          settled.current = true;
          if (reason instanceof ApiError && reason.code === 'sharing_required') {
            setConnections(null);
            setState('locked');
            return;
          }
          // Keep the last list on screen; a failed refresh only matters without one.
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
    const timer = window.setInterval(load, 30_000);
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

  useEffect(
    () =>
      onFriendPresence((friendId, presence) =>
        setConnections(
          (current) =>
            current && {
              ...current,
              friends: current.friends.map((friend) =>
                friend.id === friendId ? { ...friend, presence } : friend,
              ),
            },
        ),
      ),
    [],
  );

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  /** Show a reaction straight away, then confirm it with a refresh. */
  const updateReactions = useCallback(
    (workoutId: string, reactions: WorkoutReactions) => {
      setConnections(
        (current) =>
          current && {
            ...current,
            friends: current.friends.map((friend) =>
              friend.latest?.workout.id === workoutId
                ? { ...friend, latest: { ...friend.latest, reactions } }
                : friend,
            ),
          },
      );
      refresh();
    },
    [refresh],
  );

  return { connections, state, error, refresh, updateReactions };
}
