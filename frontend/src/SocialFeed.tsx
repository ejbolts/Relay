import { useState } from 'react';
import { friendSession, relativeDay } from './friendFeedData';
import { Icon } from './Icon';
import { PresenceAvatar } from './PresenceAvatar';
import { presenceStatus, useNow, workoutElapsed } from './presence';
import { ProfileAvatar } from './ProfileAvatar';
import { LoadProblem, SharingLocked } from './SharedProfiles';
import { updateCachedReactions } from './sharedProfileCache';
import { useTimeline } from './timeline';
import { formatVolume, workingSets, workoutVolumeKg } from './trainingSummary';
import { useWeightUnit } from './trainingPreferencesContext';
import type {
  FriendActivity,
  TimelineItem,
  TrackedMovement,
  TrackedWorkout,
  WorkoutPhoto,
  WorkoutReactions,
} from './types';
import { useUserSession } from './userContext';
import { formatMinutesDuration, localDate } from './utils';
import { WorkoutPhotoEditor, WorkoutPhotos } from './WorkoutPhotos';
import { WorkoutReactionControl } from './WorkoutReactionControl';
import './socialFeed.css';

/** Exercises listed on a card before the rest are counted. */
const SHOWN_EXERCISES = 3;

function completedSets(movement: TrackedMovement) {
  return movement.sets.filter((item) => item.completed);
}

/** "3 sets", or the distance or time for a cardio exercise. */
function movementResult(movement: TrackedMovement): string {
  const completed = completedSets(movement);
  if (movement.exercise.kind === 'cardio') {
    const distance = completed.reduce((total, item) => total + (item.distance_km ?? 0), 0);
    if (distance > 0) return `${Number(distance.toFixed(1))} km`;
    const seconds = completed.reduce((total, item) => total + (item.duration_seconds ?? 0), 0);
    if (seconds > 0) return formatMinutesDuration(Math.round(seconds / 60));
  }
  return `${completed.length} ${completed.length === 1 ? 'set' : 'sets'}`;
}

function FeedStats({ workout, records }: { workout: TrackedWorkout; records: number }) {
  const weightUnit = useWeightUnit();
  const session = friendSession(workout);
  const sets = workingSets(workout).length;
  const volume = workoutVolumeKg(workout);
  const stats: Array<[string, string]> = [];
  if (workout.duration_minutes)
    stats.push(['Time', formatMinutesDuration(workout.duration_minutes)]);
  if (session.cardio) {
    if (session.detail) stats.push(['Distance', session.detail]);
  } else {
    if (sets) stats.push(['Sets', String(sets)]);
    if (volume > 0) stats.push(['Volume', formatVolume(volume, weightUnit)]);
  }
  if (!stats.length && !records) return null;
  return (
    <dl className="feed-stats">
      {stats.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className="num">{value}</dd>
        </div>
      ))}
      {records > 0 && (
        <div className="feed-stat-records">
          <dt>Records</dt>
          <dd className="num">
            <Icon name="trophy" />
            {records} {records === 1 ? 'PR' : 'PRs'}
          </dd>
        </div>
      )}
    </dl>
  );
}

function FeedCard({
  item,
  today,
  picking,
  onPickingChange,
  onOpenMember,
  onOpenWorkout,
  onOpenPerson,
  onReactionsChange,
  onPhotosChange,
}: {
  item: TimelineItem;
  today: string;
  picking: boolean;
  onPickingChange: (open: boolean) => void;
  /** Opens whoever logged the workout: a friend's profile, or your own. */
  onOpenMember: () => void;
  onOpenWorkout: () => void;
  /** Opens someone named in the reactions or comments. */
  onOpenPerson: (person: { id: string; display_name: string }) => void;
  onReactionsChange: (reactions: WorkoutReactions) => void;
  onPhotosChange: (photos: WorkoutPhoto[]) => void;
}) {
  const { member, workout } = item;
  const session = friendSession(workout);
  const owner = member.is_you ? 'Your' : `${member.display_name}’s`;
  const subject = `${owner} ${workout.name}`;
  const photos = workout.photos ?? [];
  const movements = workout.movements.filter((movement) => completedSets(movement).length > 0);
  const hidden = movements.length - SHOWN_EXERCISES;
  const [showAll, setShowAll] = useState(false);
  const exercisesId = `feed-exercises-${workout.id}`;

  return (
    <li className={`feed-card${picking ? ' is-picking' : ''}`}>
      <article aria-label={subject}>
        <header className="feed-card-header">
          <button
            type="button"
            className="feed-card-person"
            aria-label={
              member.is_you ? 'Open your profile' : `Open ${member.display_name}’s profile`
            }
            onClick={onOpenMember}
          >
            <ProfileAvatar
              className="shared-profile-avatar small"
              user={{ ...member, username: '' }}
            />
            <span className="feed-card-name">
              <b>{member.is_you ? 'You' : member.display_name}</b>
              <small>{relativeDay(workout.workout_date, today)}</small>
            </span>
          </button>
          <span className={`friend-activity-kind ${session.cardio ? 'cardio' : 'strength'}`}>
            {session.cardio ? 'Cardio' : 'Strength'}
          </span>
        </header>
        <button
          type="button"
          className="feed-card-title friend-workout-link"
          aria-label={`Open ${subject} workout`}
          onClick={onOpenWorkout}
        >
          {session.name}
        </button>
        <FeedStats workout={workout} records={item.record_count} />
        {member.is_you ? (
          <WorkoutPhotoEditor
            workoutId={workout.id}
            photos={photos}
            subject={subject}
            layout="feed"
            onChange={onPhotosChange}
          />
        ) : (
          <WorkoutPhotos photos={photos} subject={subject} />
        )}
        {movements.length > 0 && (
          <ul id={exercisesId} className="feed-exercises" aria-label="Exercises">
            {(showAll ? movements : movements.slice(0, SHOWN_EXERCISES)).map((movement) => (
              <li key={movement.id}>
                <span>{movement.exercise.name}</span>
                <span className="num">{movementResult(movement)}</span>
              </li>
            ))}
            {hidden > 0 && (
              <li className="feed-exercises-more">
                <button
                  type="button"
                  aria-expanded={showAll}
                  aria-controls={exercisesId}
                  onClick={() => setShowAll((current) => !current)}
                >
                  {showAll
                    ? 'Show fewer'
                    : `+${hidden} more ${hidden === 1 ? 'exercise' : 'exercises'}`}
                </button>
              </li>
            )}
          </ul>
        )}
        <div className="feed-card-social">
          <WorkoutReactionControl
            ownWorkout={member.is_you}
            onOpenMember={onOpenPerson}
            workoutId={workout.id}
            subject={subject}
            reactions={item.reactions}
            open={picking}
            onOpenChange={onPickingChange}
            onChange={onReactionsChange}
          />
        </div>
      </article>
    </li>
  );
}

/** Friends working out right now, above the feed. */
function TrainingNow({
  friends,
  onOpenFriend,
}: {
  friends: FriendActivity[];
  onOpenFriend: (friend: Pick<FriendActivity, 'id' | 'display_name'>) => void;
}) {
  const live = friends.flatMap((friend) => {
    const status = presenceStatus(friend.presence);
    return status?.kind === 'workout' ? [{ friend, status }] : [];
  });
  const now = useNow(live.length > 0);
  if (!live.length) return null;
  return (
    <ul className="feed-live" aria-label="Training now">
      {live.map(({ friend, status }) => (
        <li key={friend.id}>
          <button
            type="button"
            aria-label={`Open ${friend.display_name}’s profile, training now`}
            onClick={() => onOpenFriend(friend)}
          >
            <PresenceAvatar user={{ ...friend, username: '' }} status={status} />
            <span className="feed-live-name">
              <b>{friend.display_name}</b>
              <small>
                {status.workout.name} · {workoutElapsed(status.workout.started_at, now)}
              </small>
            </span>
            <span className="friend-activity-kind live">Live</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FeedSkeleton() {
  return (
    <ul className="feed-cards feed-loading-skeleton" role="status" aria-label="Loading the feed">
      {[0, 1].map((item) => (
        <li className="feed-card" key={item} aria-hidden="true">
          <div className="feed-card-header">
            <span className="skeleton-block friend-skeleton-avatar" />
            <span className="feed-card-name">
              <span className="skeleton-block friend-skeleton-name" />
              <span className="skeleton-block friend-skeleton-meta" />
            </span>
          </div>
          <span className="skeleton-block feed-skeleton-title" />
          <span className="skeleton-block feed-skeleton-photo" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Social's Feed tab: every workout you and your friends have shared, newest first, with its
 * photos, a summary of the session and its reactions and comments.
 */
export function SocialFeed({
  active,
  friends,
  today = localDate(),
  onOpenProfile,
  onOpenOwnProfile,
  onOpenFind,
  onChooseSharing,
}: {
  active: boolean;
  /** Friends with live activity, from Social's friend list; null until it has loaded. */
  friends: FriendActivity[] | null;
  today?: string;
  onOpenProfile: (
    profile: { id: string; display_name: string },
    workout?: Pick<TrackedWorkout, 'id' | 'workout_date'>,
  ) => void;
  onOpenOwnProfile: () => void;
  onOpenFind: () => void;
  onChooseSharing: () => void;
}) {
  const { items, hasMore, state, error, loadingMore, refresh, loadMore, update } =
    useTimeline(active);
  const [picking, setPicking] = useState<string | null>(null);
  const viewerId = useUserSession().user?.id ?? null;

  if (state === 'locked') return <SharingLocked onChooseSharing={onChooseSharing} />;
  if (!items) {
    return state === 'error' ? (
      <LoadProblem message={error ?? 'Could not load the feed.'} onRetry={refresh} />
    ) : (
      <FeedSkeleton />
    );
  }
  return (
    <div className="social-feed">
      <TrainingNow friends={friends ?? []} onOpenFriend={onOpenProfile} />
      {items.length === 0 ? (
        <section className="pulse-card friends-list-empty feed-empty">
          <p>
            {friends && friends.length > 0
              ? 'No workouts here yet. Sessions you and your friends log appear in this feed.'
              : 'Add friends to see their workouts and photos here.'}
          </p>
          {friends?.length === 0 && (
            <button type="button" className="profile-primary" onClick={onOpenFind}>
              <Icon name="search" /> Find friends
            </button>
          )}
        </section>
      ) : (
        <ul className={`feed-cards${picking ? ' is-picking' : ''}`}>
          {items.map((item) => {
            const { member, workout } = item;
            return (
              <FeedCard
                key={workout.id}
                item={item}
                today={today}
                picking={picking === workout.id}
                onPickingChange={(open) =>
                  setPicking((current) =>
                    open ? workout.id : current === workout.id ? null : current,
                  )
                }
                onOpenMember={() => (member.is_you ? onOpenOwnProfile() : onOpenProfile(member))}
                onOpenWorkout={() => onOpenProfile(member, workout)}
                onOpenPerson={onOpenProfile}
                onReactionsChange={(reactions) => {
                  updateCachedReactions(viewerId, member.id, workout.id, reactions);
                  update(workout.id, (current) => ({ ...current, reactions }));
                }}
                onPhotosChange={(photos) =>
                  update(workout.id, (current) => ({
                    ...current,
                    workout: { ...current.workout, photos },
                  }))
                }
              />
            );
          })}
        </ul>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {hasMore && (
        <button
          type="button"
          className="show-more-button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? 'Loading…' : 'Show older workouts'}
        </button>
      )}
    </div>
  );
}
