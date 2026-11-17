import { useEffect, useId, useState } from 'react';
import { friendSession, lastWeek, reactionSummary, relativeDay } from './friendFeedData';
import type { FriendConnectionsState } from './friendConnections';
import { Icon } from './Icon';
import { PresenceAvatar } from './PresenceAvatar';
import { byLiveActivity, presenceStatus, presenceText, useNow, workoutElapsed } from './presence';
import { plural } from './sharedProfileDisplay';
import { LoadProblem, SharingLocked } from './SharedProfiles';
import {
  prefetchSharedProfile,
  prefetchSharedProfiles,
  PREFETCH_LIMIT,
  updateCachedReactions,
} from './sharedProfileCache';
import { parseLocalDate } from './trainingSummary';
import type { FriendActivity, FriendConnections, WorkoutReactions } from './types';
import { useUserSession } from './userContext';
import { localDate } from './utils';
import { WorkoutReactionControl } from './WorkoutReactionControl';

/** How often the profiles at the top of the list are refreshed while the tab stays open. */
const PREFETCH_REFRESH_MS = 5 * 60_000;

/** Changes when a friend logs a session, so their background copy is loaded again. */
function profileSignature(friend: FriendActivity): string {
  return `${friend.latest?.workout.id ?? ''}:${friend.recent_workout_count}`;
}

function dayTitle(value: string): string {
  return parseLocalDate(value).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function dayLetter(value: string): string {
  return parseLocalDate(value).toLocaleDateString('en-GB', { weekday: 'narrow' });
}

function FriendCard({
  friend,
  today,
  now,
  picking,
  onPickingChange,
  onOpen,
  onOpenWorkout,
  onOpenMember,
  onReactionsChange,
  onIntent,
}: {
  /** Pointing at or focusing the friend: their profile is about to be opened. */
  onIntent: () => void;
  friend: FriendActivity;
  today: string;
  now: number;
  picking: boolean;
  onPickingChange: (open: boolean) => void;
  onOpen: () => void;
  onOpenWorkout: () => void;
  onOpenMember: (person: { id: string; display_name: string }) => void;
  onReactionsChange: (workoutId: string, reactions: WorkoutReactions) => void;
}) {
  const latest = friend.latest;
  const trained = new Set(friend.training_dates);
  const week = lastWeek(today);
  const activeDays = week.filter((day) => trained.has(day)).length;
  const session = latest ? friendSession(latest.workout) : null;
  const summary = latest ? reactionSummary(latest.reactions.counts) : null;
  const status = presenceStatus(friend.presence);
  const statusText = presenceText(status, now);
  const live = status?.kind === 'workout' ? status.workout : null;

  return (
    <li
      className={
        [picking && 'is-picking', live && 'is-live'].filter(Boolean).join(' ') || undefined
      }
    >
      <div className="friend-card-top">
        <button
          type="button"
          className="friend-card-person"
          aria-label={`Open ${friend.display_name}'s profile${statusText ? `, ${statusText}` : ''}`}
          onMouseEnter={onIntent}
          onFocus={onIntent}
          onClick={onOpen}
        >
          <PresenceAvatar user={{ ...friend, username: '' }} status={status} />
          <span className="friend-card-name">
            <b>{friend.display_name}</b>
            {statusText ? (
              <small className={`friend-status ${status?.kind}`}>{statusText}</small>
            ) : (
              <small>{plural(friend.recent_workout_count, 'workout')} in the last 30 days</small>
            )}
          </span>
        </button>
        <span
          className="friend-week"
          role="img"
          aria-label={`Trained on ${activeDays} of the last ${week.length} days${live ? ', training now' : ''}`}
        >
          {week.map((day) => (
            <span
              key={day}
              className={
                [
                  trained.has(day) && 'is-trained',
                  day === today && 'is-today',
                  day === today && live && !trained.has(day) && 'is-live',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              title={dayTitle(day)}
            >
              {dayLetter(day)}
            </span>
          ))}
        </span>
      </div>
      {live ? (
        <div className="friend-card-latest is-live">
          <span className="friend-activity-kind live">Live</span>
          <span className="friend-card-session">
            <span className="friend-card-title">{live.name}</span>
            <span className="friend-activity-meta">
              {live.kind === 'cardio' ? 'Cardio' : 'Strength'} ·{' '}
              {workoutElapsed(live.started_at, now)} so far
            </span>
          </span>
        </div>
      ) : latest && session && summary ? (
        <div className="friend-card-latest">
          <span className="friend-card-session">
            <button
              type="button"
              className="friend-card-title friend-workout-link"
              aria-label={`Open ${friend.display_name}’s ${latest.workout.name} workout`}
              title={session.title}
              onMouseEnter={onIntent}
              onFocus={onIntent}
              onClick={onOpenWorkout}
            >
              {session.title}
            </button>
            <span className="friend-card-meta">
              <span className={`friend-activity-kind ${session.cardio ? 'cardio' : 'strength'}`}>
                {session.cardio ? 'Cardio' : 'Strength'}
              </span>
              <span>
                {[relativeDay(latest.workout.workout_date, today), session.detail]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
          </span>
          <WorkoutReactionControl
            onOpenMember={onOpenMember}
            workoutId={latest.workout.id}
            subject={`${friend.display_name}’s ${latest.workout.name}`}
            reactions={latest.reactions}
            open={picking}
            onOpenChange={onPickingChange}
            onChange={(value) => onReactionsChange(latest.workout.id, value)}
          />
        </div>
      ) : (
        <p className="friend-card-empty">No sessions logged yet.</p>
      )}
    </li>
  );
}

function FriendsSkeleton() {
  return (
    <section
      className="pulse-card friends-list friends-loading-skeleton"
      role="status"
      aria-label="Loading your friends"
      aria-busy="true"
    >
      <header className="pulse-card-header" aria-hidden="true">
        <h2>
          Friends <span className="skeleton-block friend-skeleton-count" />
        </h2>
      </header>
      <ul className="friend-cards" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <li key={item}>
            <div className="friend-card-top">
              <div className="friend-card-person">
                <span className="skeleton-block friend-skeleton-avatar" />
                <span className="friend-card-name">
                  <span className="skeleton-block friend-skeleton-name" />
                  <span className="skeleton-block friend-skeleton-meta" />
                </span>
              </div>
              <span className="skeleton-block friend-skeleton-week" />
            </div>
            <div className="friend-card-latest">
              <span className="friend-card-session">
                <span className="skeleton-block friend-skeleton-session" />
                <span className="skeleton-block friend-skeleton-meta" />
              </span>
              <span className="skeleton-block friend-skeleton-actions" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Social's Friends tab: each friend once with their latest session, or the workout they are doing
 * now. Friends working out come first, then those online, then the most recently active.
 */
export function FriendsList({
  connections,
  state,
  error,
  active = true,
  today = localDate(),
  onRetry,
  onOpenFriend,
  onOpenFind,
  onChooseSharing,
  onReactionsChange,
}: {
  connections: FriendConnections | null;
  state: FriendConnectionsState;
  error: string | null;
  /** Whether the list is on screen; the first few profiles load in the background while it is. */
  active?: boolean;
  today?: string;
  onRetry: () => void;
  onOpenFriend: (
    friend: Pick<FriendActivity, 'id' | 'display_name'>,
    workout?: Pick<NonNullable<FriendActivity['latest']>['workout'], 'id' | 'workout_date'>,
  ) => void;
  onOpenFind: () => void;
  onChooseSharing: () => void;
  onReactionsChange: (workoutId: string, reactions: WorkoutReactions) => void;
}) {
  const titleId = useId();
  const [picking, setPicking] = useState<string | null>(null);
  const now = useNow(connections?.friends.some((friend) => friend.presence) ?? false);
  const viewerId = useUserSession().user?.id ?? null;
  const friends = byLiveActivity(connections?.friends ?? [], (friend) => friend.presence);
  // Opening one of the first few friends is instant: their profiles load while the list is idle.
  const prefetchKey =
    state === 'locked'
      ? ''
      : JSON.stringify(
          friends
            .slice(0, PREFETCH_LIMIT)
            .map((friend) => ({ id: friend.id, signature: profileSignature(friend) })),
        );
  useEffect(() => {
    if (!active || !prefetchKey) return;
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

  if (state === 'locked') return <SharingLocked onChooseSharing={onChooseSharing} />;
  if (!connections) {
    return state === 'error' ? (
      <LoadProblem message={error ?? 'Could not load your friends.'} onRetry={onRetry} />
    ) : (
      <FriendsSkeleton />
    );
  }
  return (
    <section className="pulse-card friends-list" aria-labelledby={titleId}>
      <header className="pulse-card-header">
        <h2 id={titleId}>
          Friends <span className="friends-list-count">{friends.length}</span>
        </h2>
      </header>
      {friends.length === 0 ? (
        <div className="friends-list-empty">
          <p>Add friends to see their latest sessions here and react to them.</p>
          <button type="button" className="profile-primary" onClick={onOpenFind}>
            <Icon name="search" /> Find friends
          </button>
        </div>
      ) : (
        <ul className={`friend-cards${picking ? ' is-picking' : ''}`}>
          {friends.map((friend) => {
            const workoutId = friend.latest?.workout.id ?? null;
            return (
              <FriendCard
                key={friend.id}
                friend={friend}
                today={today}
                now={now}
                picking={workoutId !== null && picking === workoutId}
                onPickingChange={(open) =>
                  setPicking((current) =>
                    open ? workoutId : current === workoutId ? null : current,
                  )
                }
                onOpenMember={onOpenFriend}
                onOpen={() => onOpenFriend(friend)}
                onOpenWorkout={() => onOpenFriend(friend, friend.latest?.workout)}
                onIntent={() =>
                  void prefetchSharedProfile(viewerId, friend.id, profileSignature(friend))
                }
                onReactionsChange={(workoutId, reactions) => {
                  updateCachedReactions(viewerId, friend.id, workoutId, reactions);
                  onReactionsChange(workoutId, reactions);
                }}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
