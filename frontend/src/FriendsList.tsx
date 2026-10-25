import { useId, useState } from 'react';
import { friendSession, lastWeek, reactionSummary, relativeDay } from './friendFeedData';
import type { FriendConnectionsState } from './friendConnections';
import { Icon } from './Icon';
import { ProfileAvatar } from './ProfileAvatar';
import { plural } from './sharedProfileDisplay';
import { LoadProblem, SharingLocked } from './SharedProfiles';
import { parseLocalDate } from './trainingSummary';
import type { FriendActivity, FriendConnections, WorkoutReactions } from './types';
import { localDate } from './utils';
import { WorkoutReactionControl } from './WorkoutReactionControl';

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
  picking,
  onPickingChange,
  onOpen,
  onOpenMember,
  onReactionsChange,
}: {
  friend: FriendActivity;
  today: string;
  picking: boolean;
  onPickingChange: (open: boolean) => void;
  onOpen: () => void;
  onOpenMember: (person: { id: string; display_name: string }) => void;
  onReactionsChange: (workoutId: string, reactions: WorkoutReactions) => void;
}) {
  const latest = friend.latest;
  const trained = new Set(friend.training_dates);
  const week = lastWeek(today);
  const activeDays = week.filter((day) => trained.has(day)).length;
  const session = latest ? friendSession(latest.workout) : null;
  const summary = latest ? reactionSummary(latest.reactions.counts) : null;

  return (
    <li className={picking ? 'is-picking' : undefined}>
      <div className="friend-card-top">
        <button
          type="button"
          className="friend-card-person"
          aria-label={`Open ${friend.display_name}'s profile`}
          onClick={onOpen}
        >
          <ProfileAvatar
            className="shared-profile-avatar small"
            user={{ ...friend, username: '' }}
          />
          <span className="friend-card-name">
            <b>{friend.display_name}</b>
            <small>{plural(friend.recent_workout_count, 'workout')} in the last 30 days</small>
          </span>
        </button>
        <span
          className="friend-week"
          role="img"
          aria-label={`Trained on ${activeDays} of the last ${week.length} days`}
        >
          {week.map((day) => (
            <span
              key={day}
              className={
                [trained.has(day) && 'is-trained', day === today && 'is-today']
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
      {latest && session && summary ? (
        <div className="friend-card-latest">
          <span className={`friend-activity-kind ${session.cardio ? 'cardio' : 'strength'}`}>
            {session.cardio ? 'Cardio' : 'Strength'}
          </span>
          <span className="friend-card-session">
            <span className="friend-card-title">{session.title}</span>
            <span className="friend-activity-meta">
              {[relativeDay(latest.workout.workout_date, today), session.detail]
                .filter(Boolean)
                .join(' · ')}
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

/** Social's Friends tab: each friend once, most recently active first, with their latest session. */
export function FriendsList({
  connections,
  state,
  error,
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
  today?: string;
  onRetry: () => void;
  onOpenFriend: (friend: Pick<FriendActivity, 'id' | 'display_name'>) => void;
  onOpenFind: () => void;
  onChooseSharing: () => void;
  onReactionsChange: (workoutId: string, reactions: WorkoutReactions) => void;
}) {
  const titleId = useId();
  const [picking, setPicking] = useState<string | null>(null);

  if (state === 'locked') return <SharingLocked onChooseSharing={onChooseSharing} />;
  if (!connections) {
    return state === 'error' ? (
      <LoadProblem message={error ?? 'Could not load your friends.'} onRetry={onRetry} />
    ) : (
      <p className="sharing-loading" role="status">
        Loading your friends…
      </p>
    );
  }
  const friends = connections.friends;
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
                picking={workoutId !== null && picking === workoutId}
                onPickingChange={(open) =>
                  setPicking((current) =>
                    open ? workoutId : current === workoutId ? null : current,
                  )
                }
                onOpenMember={onOpenFriend}
                onOpen={() => onOpenFriend(friend)}
                onReactionsChange={onReactionsChange}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
