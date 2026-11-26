import { useEffect, useRef, useState } from 'react';
import {
  FEED_SHOWN_EXERCISES,
  feedExercises,
  feedStats,
  friendSession,
  relativeDay,
} from './friendFeedData';
import { ExerciseIcon } from './ExerciseIcon';
import { Icon } from './Icon';
import { motionReduced } from './motion';
import { PopupDialog } from './PopupDialog';
import { FriendsRail } from './FriendsRail';
import { ProfileAvatar } from './ProfileAvatar';
import { ShowMoreButton } from './ShowMoreButton';
import { LoadProblem, SharingLocked } from './SharedProfiles';
import { updateCachedReactions } from './sharedProfileCache';
import { useTimeline } from './timeline';
import { useWeightUnit } from './trainingPreferencesContext';
import type {
  FriendActivity,
  TimelineItem,
  TrackedWorkout,
  WorkoutPhoto,
  WorkoutReactions,
} from './types';
import { useUserSession } from './userContext';
import { localDate } from './utils';
import { WorkoutPhotoEditor, WorkoutPhotos } from './WorkoutPhotos';
import { WorkoutComments } from './WorkoutComments';
import { WorkoutReactionControl } from './WorkoutReactionControl';
import { WorkoutReactionPeople } from './WorkoutReactionPeople';
import { clearWorkoutFocus, useWorkoutFocus, type WorkoutFocus } from './workoutFocus';
import { FOCUS_HIGHLIGHT_MS, workoutFocusStep } from './workoutFocusRequest';
import './socialFeed.css';

function FeedStats({ workout, records }: { workout: TrackedWorkout; records: number }) {
  const weightUnit = useWeightUnit();
  // One line: each value carries its own unit, so none needs a label.
  const stats = feedStats(workout, weightUnit);
  if (!stats.length && !records) return null;
  return (
    <ul className="feed-stats num" aria-label="Summary">
      {stats.map((value) => (
        <li key={value}>{value}</li>
      ))}
      {records > 0 && (
        <li className="feed-stat-records">
          <Icon name="trophy" />
          {records} {records === 1 ? 'PR' : 'PRs'}
        </li>
      )}
    </ul>
  );
}

function FeedCard({
  item,
  today,
  picking,
  focus,
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
  /** A notification's request to reveal this card and open its reactions or comments. */
  focus: WorkoutFocus | null;
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
  // A session of one exercise named after it (a run called "Running") needs no exercise line.
  const movements = feedExercises(workout);
  const listExercises = movements.length > 0;
  const hidden = movements.length - FEED_SHOWN_EXERCISES;
  const listed = movements.slice(0, FEED_SHOWN_EXERCISES);
  const card = useRef<HTMLLIElement>(null);
  const [highlighted, setHighlighted] = useState(false);
  const focusKey = focus?.key;

  useEffect(() => {
    if (focusKey === undefined) return;
    setHighlighted(true);
    // After the app's own scroll to the top of a newly opened screen.
    const frame = requestAnimationFrame(() =>
      card.current?.scrollIntoView?.({
        block: 'center',
        behavior: motionReduced() ? 'auto' : 'smooth',
      }),
    );
    const timer = window.setTimeout(() => setHighlighted(false), FOCUS_HIGHLIGHT_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [focusKey]);
  const reactionControl = (
    <div className="feed-card-social">
      <WorkoutReactionControl
        compact
        ownWorkout={member.is_you}
        onOpenMember={onOpenPerson}
        workoutId={workout.id}
        subject={subject}
        reactions={item.reactions}
        open={picking}
        focus={focus}
        onOpenChange={onPickingChange}
        onChange={onReactionsChange}
      />
    </div>
  );

  return (
    <li
      ref={card}
      className={`feed-card${picking ? ' is-picking' : ''}${highlighted ? ' is-focused' : ''}`}
    >
      <article aria-label={subject}>
        <header className="feed-card-header">
          {/* The name beside it opens the same profile, so the avatar stays out of the tab order. */}
          <button
            type="button"
            className="feed-card-avatar"
            tabIndex={-1}
            aria-hidden="true"
            onClick={onOpenMember}
          >
            <ProfileAvatar
              className="shared-profile-avatar small"
              user={{ ...member, username: '' }}
            />
          </button>
          <div className="feed-card-heading">
            <button
              type="button"
              className="feed-card-title friend-workout-link"
              aria-label={`Open ${subject} workout`}
              onClick={onOpenWorkout}
            >
              {session.name}
            </button>
            <button
              type="button"
              className="feed-card-person"
              aria-label={
                member.is_you ? 'Open your profile' : `Open ${member.display_name}’s profile`
              }
              onClick={onOpenMember}
            >
              <span className="feed-card-name">
                <b>{member.is_you ? 'You' : member.display_name}</b>
                <small>{relativeDay(workout.workout_date, today)}</small>
              </span>
            </button>
          </div>
        </header>
        {member.is_you ? (
          <>
            <WorkoutPhotoEditor
              workoutId={workout.id}
              photos={photos}
              subject={subject}
              layout="feed"
              onChange={onPhotosChange}
            />
            {reactionControl}
          </>
        ) : (
          <>
            {reactionControl}
            <WorkoutPhotos photos={photos} subject={subject} />
          </>
        )}
        <FeedStats workout={workout} records={item.record_count} />
        {listExercises && (
          <ul className="feed-exercises" aria-label="Exercises">
            {listed.map((movement) => (
              <li key={movement.id}>
                <ExerciseIcon exercise={movement.exercise} />
                <span>{movement.exercise.name}</span>
              </li>
            ))}
            {hidden > 0 && (
              <li className="feed-exercises-more">
                <button
                  type="button"
                  aria-label={`Open ${subject} workout, with ${hidden} more ${hidden === 1 ? 'exercise' : 'exercises'}`}
                  onClick={onOpenWorkout}
                >
                  +{hidden} {hidden === 1 ? 'exercise' : 'exercises'}
                </button>
              </li>
            )}
          </ul>
        )}
      </article>
    </li>
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
 * Social's Feed tab: a row of your friends, then every workout you and your friends have shared,
 * newest first, with its photos, a summary of the session and its reactions and comments.
 */
export function SocialFeed({
  active,
  preload = false,
  friends,
  today = localDate(),
  onOpenProfile,
  onOpenOwnProfile,
  onOpenFind,
  onChooseSharing,
}: {
  active: boolean;
  /** Reads the first page in the background before the feed is shown. */
  preload?: boolean;
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
  const { items, hasMore, state, error, loadingMore, refresh, loadMore, update } = useTimeline(
    active,
    preload,
  );
  const [picking, setPicking] = useState<string | null>(null);
  const viewerId = useUserSession().user?.id ?? null;
  const request = useWorkoutFocus();
  const [focus, setFocus] = useState<WorkoutFocus | null>(null);
  // A workout beyond the pages searched opens its reactions or comments over the feed instead.
  const [detached, setDetached] = useState<WorkoutFocus | null>(null);
  const searched = useRef({ key: 0, pages: 0 });

  useEffect(() => {
    if (!active || !request || loadingMore) return;
    if (state === 'locked') return clearWorkoutFocus(request.key);
    if (!items) return;
    if (searched.current.key !== request.key) searched.current = { key: request.key, pages: 0 };
    const step = workoutFocusStep(request, {
      workoutIds: items.map((item) => item.workout.id),
      hasMore,
      pagesSearched: searched.current.pages,
    });
    if (step === 'reveal') {
      setFocus(request);
      clearWorkoutFocus(request.key);
      return;
    }
    if (step === 'load-more') {
      searched.current.pages += 1;
      void loadMore();
      return;
    }
    setDetached(request);
    clearWorkoutFocus(request.key);
  }, [active, request, items, state, hasMore, loadingMore, loadMore]);

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
      <FriendsRail
        friends={friends ?? []}
        today={today}
        active={active}
        onOpenFriend={onOpenProfile}
      />
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
                focus={focus?.workoutId === workout.id ? focus : null}
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
      {detached?.panel === 'people' && (
        <WorkoutReactionPeople
          workoutId={detached.workoutId}
          highlightPersonId={detached.personId}
          onClose={() => setDetached(null)}
        />
      )}
      {detached?.panel === 'comments' && (
        <PopupDialog
          title={detached.workoutName}
          className="follow-notification-thread"
          onClose={() => setDetached(null)}
        >
          <WorkoutComments
            workoutId={detached.workoutId}
            focusComment={detached.commentId}
            onCountChange={() => {}}
          />
        </PopupDialog>
      )}
      {hasMore && (
        <ShowMoreButton loading={loadingMore} onClick={() => void loadMore()}>
          Show older workouts
        </ShowMoreButton>
      )}
    </div>
  );
}
