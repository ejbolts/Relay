import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, isConnectionFailure } from './api';
import { authErrorMessage } from './authForm';
import { reactionChoice, reactionSummary } from './friendFeedData';
import { Icon } from './Icon';
import { useHeightAnimation } from './motionHooks';
import { pendingReactionLabel } from './pendingReactionQueue';
import { queueReaction, usePendingReaction } from './pendingReactions';
import type { WorkoutReactionKind, WorkoutReactions, WorkoutComment } from './types';
import { WorkoutComments } from './WorkoutComments';
import { WorkoutReactionPeople } from './WorkoutReactionPeople';
import type { WorkoutFocus } from './workoutFocus';

// Loaded when first opened, so the emoji catalogue stays out of the app's first download.
const EmojiReactionSheet = lazy(() => import('./EmojiReactionSheet'));

type Panel = 'reactions' | 'comments' | 'people';

/** Emojis stacked beside the total in a card header, so a long workout name keeps its room. */
const HEADER_EMOJIS = 2;

/** Separate reaction and comment icons, shared by Home, Social and shared workouts. */
export function WorkoutReactionControl({
  workoutId,
  subject,
  reactions,
  open,
  focus,
  onOpenChange,
  onChange,
  onOpenMember,
  ownWorkout = false,
  compact = false,
}: {
  workoutId: string;
  subject: string;
  reactions: WorkoutReactions;
  /** Whether this workout's picker or comments are open; the parent closes it when another opens. */
  open: boolean;
  /** Opens the reactions sheet or comments at a notification's reaction or comment. */
  focus?: WorkoutFocus | null;
  onOpenChange: (open: boolean) => void;
  onChange: (value: WorkoutReactions) => void;
  showSummary?: boolean;
  ownWorkout?: boolean;
  /** One reaction total instead of a count per emoji, for a narrow space such as a card header. */
  compact?: boolean;
  onOpenMember?: (person: WorkoutComment['author']) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [visited, setVisited] = useState(false);
  // Whether the open panel came from `focus`; opening it yourself shows it without a highlight.
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentLayout, setContentLayout] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const reactTrigger = useRef<HTMLButtonElement>(null);
  const commentTrigger = useRef<HTMLButtonElement>(null);
  const peopleTrigger = useRef<HTMLButtonElement>(null);
  const restoreReactFocus = useRef(false);
  const closeRef = useRef(onOpenChange);
  closeRef.current = onOpenChange;
  const shown = open ? panel : null;
  const layout = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    // Home and feed place the buttons and panels in a parent grid with display: contents.
    // Animate the first real layout box so the card and everything below it glide together.
    let element: HTMLElement | null = container.current;
    while (element && getComputedStyle(element).display === 'contents') {
      element = element.parentElement;
    }
    layout.current = element;
  });
  useHeightAnimation(layout, JSON.stringify([shown, contentLayout]));
  const yours = reactions.yours;
  const pending = usePendingReaction(workoutId, onChange);
  const waiting = !ownWorkout && pending !== undefined;
  const pendingChoice = waiting ? reactionChoice(pending) : undefined;
  const summary = reactionSummary(reactions.counts);
  const selected = ownWorkout ? undefined : reactionChoice(yours);
  const comments = reactions.comment_count ?? 0;
  const commentLabel = `${comments} ${comments === 1 ? 'comment' : 'comments'}`;
  const reactionCount = `${summary.total} ${summary.total === 1 ? 'reaction' : 'reactions'}`;

  function show(next: Panel | null) {
    setPanel(next);
    setFocused(false);
    setError(null);
    if (next === 'comments') setVisited(true);
    onOpenChange(next !== null);
  }

  const focusKey = focus?.key;
  useEffect(() => {
    if (!focus) return;
    // Closing the sheet returns focus to the reaction total, as if it had been tapped.
    peopleTrigger.current =
      container.current?.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]') ?? null;
    show(focus.panel);
    setFocused(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per request
  }, [focusKey]);

  useEffect(() => {
    if (!shown && restoreReactFocus.current) {
      restoreReactFocus.current = false;
      reactTrigger.current?.focus();
    }
  }, [shown, yours]);

  useEffect(() => {
    // The emoji sheet and the people sheet close themselves.
    if (shown !== 'comments') return;
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setPanel(null);
      closeRef.current(false);
      commentTrigger.current?.focus();
    }
    // A comment thread stays open while you scroll, tap away or dismiss the keyboard, until its
    // button or Escape closes it.
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [shown]);

  /** Saves a reaction, or removes yours when `next` is null. */
  async function react(next: WorkoutReactionKind | null) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const wait = () => {
      queueReaction(workoutId, next);
      show(null);
    };
    try {
      if (navigator.onLine === false) return wait();
      const updated = next
        ? await api.sharing.react(workoutId, next)
        : await api.sharing.removeReaction(workoutId);
      restoreReactFocus.current = true;
      onChange(updated);
      show(null);
    } catch (reason) {
      if (isConnectionFailure(reason)) wait();
      else setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const reactButton = (
    <button
      ref={reactTrigger}
      type="button"
      className={`discussion-button friend-react-button${waiting ? ' is-pending' : ''}`}
      aria-label={
        waiting
          ? pendingReactionLabel(subject, pending)
          : selected
            ? `Your reaction to ${subject}: ${selected.label}. Change reaction`
            : `React to ${subject}`
      }
      title={waiting ? "Sends when you're back online" : undefined}
      aria-description={reactionCount}
      aria-haspopup="dialog"
      aria-expanded={shown === 'reactions'}
      disabled={waiting}
      onClick={() => show(shown === 'reactions' ? null : 'reactions')}
    >
      {waiting ? (
        pendingChoice ? (
          <span aria-hidden="true">{pendingChoice.emoji}</span>
        ) : (
          <Icon name="react" />
        )
      ) : selected ? (
        <span aria-hidden="true">{selected.emoji}</span>
      ) : (
        <Icon name="react" />
      )}
    </button>
  );

  const totalButton = (className: string, withEmojis: boolean) => (
    <button
      type="button"
      className={className}
      aria-label={`View ${reactionCount} on ${subject}`}
      aria-haspopup="dialog"
      aria-expanded={shown === 'people'}
      onClick={(event) => {
        peopleTrigger.current = event.currentTarget;
        show(shown === 'people' ? null : 'people');
      }}
    >
      {withEmojis && (
        <span className="discussion-reaction-emojis" aria-hidden="true">
          {summary.emojis.slice(0, HEADER_EMOJIS).map((emoji) => (
            <span key={emoji}>{emoji}</span>
          ))}
        </span>
      )}{' '}
      {summary.total}
    </button>
  );
  const compactReactions = ownWorkout ? (
    summary.total > 0 && totalButton('discussion-button discussion-reaction-summary', true)
  ) : summary.total > 0 ? (
    <div
      className={`discussion-button discussion-reaction-summary is-joined${selected ? ' is-yours' : ''}`}
    >
      {reactButton}
      {totalButton('discussion-reaction-count', false)}
    </div>
  ) : (
    reactButton
  );

  return (
    <div ref={container} className="workout-discussion">
      <div className="workout-discussion-actions">
        {compact && compactReactions}
        {!compact &&
          reactions.counts.map(({ reaction: kind, count }) => {
            const { emoji, label } = reactionChoice(kind) ?? { emoji: kind, label: kind };
            const mine = selected && yours === kind;
            if (count <= 0 && !mine) return null;
            const peopleButton = (
              <button
                key={kind}
                type="button"
                className={
                  mine
                    ? 'discussion-reaction-count'
                    : 'discussion-button discussion-reaction-summary'
                }
                aria-label={`View ${count} ${label} ${count === 1 ? 'reaction' : 'reactions'} on ${subject}`}
                aria-haspopup="dialog"
                aria-expanded={shown === 'people'}
                onClick={(event) => {
                  peopleTrigger.current = event.currentTarget;
                  show(shown === 'people' ? null : 'people');
                }}
              >
                {!mine && <span aria-hidden="true">{emoji}</span>} {count}
              </button>
            );
            return mine ? (
              <div key={kind} className="discussion-button discussion-reaction-summary is-yours">
                {reactButton}
                {peopleButton}
              </div>
            ) : (
              peopleButton
            );
          })}
        {!compact && !ownWorkout && !selected && reactButton}
        <button
          ref={commentTrigger}
          type="button"
          className="discussion-button discussion-comments-button"
          aria-label={`${commentLabel} on ${subject}`}
          aria-expanded={shown === 'comments'}
          aria-controls={`discussion-${workoutId}`}
          onClick={() => show(shown === 'comments' ? null : 'comments')}
        >
          <Icon name="comment" />
          {comments > 0 && comments}
        </button>
      </div>
      {shown === 'people' && (
        <WorkoutReactionPeople
          workoutId={workoutId}
          highlightPersonId={focused && focus?.panel === 'people' ? focus.personId : undefined}
          onClose={() => {
            show(null);
            requestAnimationFrame(() => peopleTrigger.current?.focus());
          }}
        />
      )}
      {shown === 'reactions' && (
        <Suspense fallback={null}>
          <EmojiReactionSheet
            title={`React to ${subject}`}
            yours={selected ? yours : null}
            busy={busy}
            error={error}
            onChoose={(next) => void react(next)}
            onClose={() => show(null)}
          />
        </Suspense>
      )}
      {(shown === 'comments' || visited) && (
        <div
          hidden={shown !== 'comments'}
          id={`discussion-${workoutId}`}
          className="workout-discussion-thread"
        >
          <WorkoutComments
            onLayoutChange={setContentLayout}
            active={shown === 'comments'}
            workoutId={workoutId}
            focusComment={focused && focus?.panel === 'comments' ? focus.commentId : undefined}
            onOpenMember={onOpenMember}
            onCountChange={(count, summary) =>
              onChange(summary ?? { ...reactions, comment_count: count })
            }
          />
        </div>
      )}
    </div>
  );
}
