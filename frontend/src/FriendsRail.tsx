import { useEffect } from 'react';
import { firstName, lastWeek } from './friendFeedData';
import { PresenceAvatar } from './PresenceAvatar';
import { byLiveActivity, presenceStatus, presenceText, useNow, workoutElapsed } from './presence';
import { PREFETCH_REFRESH_MS, profilePrefetchTargets, profileSignature } from './profilePrefetch';
import { prefetchSharedProfile, prefetchSharedProfiles } from './sharedProfileCache';
import type { FriendActivity } from './types';
import { useUserSession } from './userContext';

/**
 * The feed's row of friends: training now first, then online, with a dot for each of the last
 * seven days they trained. Each opens the friend's profile.
 */
export function FriendsRail({
  friends,
  today,
  active,
  onOpenFriend,
}: {
  friends: FriendActivity[];
  today: string;
  /** Whether the row is on screen; the first few profiles load in the background while it is. */
  active: boolean;
  onOpenFriend: (friend: Pick<FriendActivity, 'id' | 'display_name'>) => void;
}) {
  const viewerId = useUserSession().user?.id ?? null;
  const now = useNow(friends.some((friend) => friend.presence));
  const ordered = byLiveActivity(friends, (friend) => friend.presence);
  const week = lastWeek(today);
  // Opening one of the first few friends is instant: their profiles load while the feed is idle.
  const prefetchKey = JSON.stringify(profilePrefetchTargets(friends));
  useEffect(() => {
    if (!active) return;
    const targets = JSON.parse(prefetchKey) as { id: string; signature: string }[];
    if (!targets.length) return;
    let stop = prefetchSharedProfiles(viewerId, targets);
    const timer = window.setInterval(() => {
      stop();
      stop = prefetchSharedProfiles(viewerId, targets);
    }, PREFETCH_REFRESH_MS);
    return () => {
      stop();
      window.clearInterval(timer);
    };
  }, [active, prefetchKey, viewerId]);

  if (!ordered.length) return null;
  return (
    <ul className="friends-rail" aria-label="Friends">
      {ordered.map((friend) => {
        const status = presenceStatus(friend.presence);
        const live = status?.kind === 'workout' ? status.workout : null;
        const trained = new Set(friend.training_dates);
        const activeDays = week.filter((day) => trained.has(day)).length;
        const statusText = live
          ? `training now: ${live.name}, ${workoutElapsed(live.started_at, now)}`
          : presenceText(status, now);
        const intent = () =>
          void prefetchSharedProfile(viewerId, friend.id, profileSignature(friend));
        return (
          <li key={friend.id}>
            <button
              type="button"
              className={`friends-rail-person${live ? ' is-live' : ''}`}
              aria-label={`Open ${friend.display_name}'s profile${
                statusText ? `, ${statusText}` : ''
              }, trained on ${activeDays} of the last ${week.length} days`}
              title={friend.display_name}
              onMouseEnter={intent}
              onFocus={intent}
              onClick={() => onOpenFriend(friend)}
            >
              <span className="friends-rail-avatar">
                <PresenceAvatar user={{ ...friend, username: '' }} status={status} />
                {live && (
                  <span className="friends-rail-live" aria-hidden="true">
                    Live
                  </span>
                )}
              </span>
              <span className="friends-rail-name">{firstName(friend.display_name)}</span>
              <span className="friends-rail-week" aria-hidden="true">
                {week.map((day) => (
                  <span
                    key={day}
                    className={
                      [trained.has(day) && 'is-trained', day === today && 'is-today']
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                  />
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
