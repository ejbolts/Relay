import { useEffect, useId, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { friendSession, loggedTime, relativeDay } from './friendFeedData';
import { WorkoutReactionControl } from './WorkoutReactionControl';
import { ProfileAvatar } from './ProfileAvatar';
import type { FriendFeedItem, WorkoutReactions } from './types';
import { localDate } from './utils';

type ActivityState =
  | { kind: 'loading' }
  | { kind: 'locked' }
  | { kind: 'error' }
  | { kind: 'ready'; items: FriendFeedItem[]; friends: number; with_sessions: number };

/** Home's Friends card: each friend's latest session, with one button to react to it. */
export function FriendsActivityCard({
  active,
  onOpenFriend,
  onOpenFriends,
  onChooseSharing,
  title = 'Recent Friends Activity',
  friendsLabel = 'See all',
  today = localDate(),
}: {
  active: boolean;
  onOpenFriend: (friend: FriendFeedItem['friend']) => void;
  onOpenFriends: () => void;
  onChooseSharing?: () => void;
  title?: string;
  friendsLabel?: string;
  today?: string;
}) {
  const titleId = useId();
  const [state, setState] = useState<ActivityState>({ kind: 'loading' });
  const [picking, setPicking] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const shown = useRef(5);
  const inFlightMore = useRef(false);
  const refresh = useRef<(limit?: number, more?: boolean) => Promise<void>>(async () => undefined);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let request = 0;
    async function load(limit = shown.current, more = false) {
      if (document.visibilityState === 'hidden' || (inFlightMore.current && !more)) return;
      const current = ++request;
      try {
        const feed = await api.sharing.feed(limit);
        if (cancelled || current !== request) return;
        shown.current = limit;
        setState({ kind: 'ready', ...feed });
        setPicking((id) => (feed.items.some((item) => item.workout.id === id) ? id : null));
        setMoreError(false);
      } catch (reason) {
        if (cancelled || current !== request) return;
        if (more && !(reason instanceof ApiError && reason.code === 'sharing_required')) {
          setMoreError(true);
        } else {
          setState(
            reason instanceof ApiError && reason.code === 'sharing_required'
              ? { kind: 'locked' }
              : { kind: 'error' },
          );
        }
      }
    }
    refresh.current = load;
    const reload = () => void load();
    reload();
    const timer = window.setInterval(reload, 30_000);
    window.addEventListener('focus', reload);
    window.addEventListener('online', reload);
    document.addEventListener('visibilitychange', reload);
    return () => {
      cancelled = true;
      refresh.current = async () => undefined;
      window.clearInterval(timer);
      window.removeEventListener('focus', reload);
      window.removeEventListener('online', reload);
      document.removeEventListener('visibilitychange', reload);
    };
  }, [active]);

  function updateReactions(workoutId: string, reactions: WorkoutReactions) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            items: current.items.map((item) =>
              item.workout.id === workoutId ? { ...item, reactions } : item,
            ),
          }
        : current,
    );
    void refresh.current();
  }

  async function loadMore() {
    if (inFlightMore.current || state.kind !== 'ready') return;
    inFlightMore.current = true;
    setLoadingMore(true);
    setMoreError(false);
    try {
      await refresh.current(state.items.length + 3, true);
    } finally {
      inFlightMore.current = false;
      setLoadingMore(false);
    }
  }

  return (
    <section className="pulse-card friends-activity" aria-labelledby={titleId}>
      <header className="pulse-card-header">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="text-link"
          onClick={state.kind === 'locked' ? (onChooseSharing ?? onOpenFriends) : onOpenFriends}
        >
          {state.kind === 'locked' ? 'Share' : friendsLabel}
        </button>
      </header>
      {state.kind === 'loading' ? (
        <p className="pulse-empty-line">Loading your friends’ sessions…</p>
      ) : state.kind === 'locked' ? (
        <p className="pulse-empty-line">
          Share your profile to add friends and react to their workouts here.
        </p>
      ) : state.kind === 'error' ? (
        <p className="pulse-empty-line">Friends’ sessions could not be loaded.</p>
      ) : state.items.length === 0 ? (
        <p className="pulse-empty-line">
          {state.friends === 0
            ? 'Add friends to see their latest workouts here.'
            : 'Your friends have not logged a workout yet.'}
        </p>
      ) : (
        <ul className={`friend-activity-list${picking ? ' is-picking' : ''}`}>
          {state.items.map((item) => {
            const session = friendSession(item.workout);
            const open = picking === item.workout.id;
            const subject = `${item.friend.display_name}’s ${item.workout.name}`;
            return (
              <li key={item.workout.id} className={open ? 'is-picking' : undefined}>
                <button
                  type="button"
                  className="friend-activity-open"
                  onClick={() => onOpenFriend(item.friend)}
                >
                  <ProfileAvatar
                    className="shared-profile-avatar small"
                    user={{ ...item.friend, username: '' }}
                  />
                  <span className="friend-activity-copy">
                    <b>{item.friend.display_name}</b>
                    <span className="friend-activity-session">
                      <span
                        className={`friend-activity-kind ${session.cardio ? 'cardio' : 'strength'}`}
                      >
                        {session.cardio ? 'Cardio' : 'Strength'}
                      </span>
                      <span className="friend-activity-title">{session.title}</span>
                    </span>
                    <span className="friend-activity-meta">
                      {[
                        relativeDay(item.workout.workout_date, today),
                        loggedTime(item.workout.created_at),
                        session.detail,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
                <WorkoutReactionControl
                  onOpenMember={onOpenFriend}
                  workoutId={item.workout.id}
                  subject={subject}
                  reactions={item.reactions}
                  open={open}
                  onOpenChange={(value) =>
                    setPicking((current) =>
                      value ? item.workout.id : current === item.workout.id ? null : current,
                    )
                  }
                  onChange={(value) => updateReactions(item.workout.id, value)}
                />
              </li>
            );
          })}
        </ul>
      )}
      {state.kind === 'ready' &&
        state.items.length > 0 &&
        state.with_sessions > state.items.length && (
          <button
            type="button"
            className="friends-activity-more"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            aria-busy={loadingMore}
          >
            {loadingMore && <span className="calendar-older-spinner" aria-hidden="true" />}
            {loadingMore ? 'Loading…' : `+${state.with_sessions - state.items.length} more`}
          </button>
        )}
      {moreError && (
        <p className="pulse-empty-line" role="alert">
          Could not load more activity. Try again.
        </p>
      )}
    </section>
  );
}
