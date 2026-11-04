import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { nextReaction, reactionSummary, REACTIONS } from './friendFeedData';
import { Icon } from './Icon';
import type { WorkoutReactions, WorkoutComment } from './types';
import { WorkoutComments } from './WorkoutComments';
import { WorkoutReactionPeople } from './WorkoutReactionPeople';

type Panel = 'reactions' | 'comments' | 'people';

/** Separate reaction and comment buttons, shared by Home, Social and shared workouts. */
export function WorkoutReactionControl({
  workoutId,
  subject,
  reactions,
  open,
  onOpenChange,
  onChange,
  onOpenMember,
  ownWorkout = false,
}: {
  workoutId: string;
  subject: string;
  reactions: WorkoutReactions;
  /** Whether this workout's picker or comments are open; the parent closes it when another opens. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: WorkoutReactions) => void;
  showSummary?: boolean;
  ownWorkout?: boolean;
  onOpenMember?: (person: WorkoutComment['author']) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [visited, setVisited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const reactTrigger = useRef<HTMLButtonElement>(null);
  const commentTrigger = useRef<HTMLButtonElement>(null);
  const peopleTrigger = useRef<HTMLButtonElement>(null);
  const restoreReactFocus = useRef(false);
  const closeRef = useRef(onOpenChange);
  closeRef.current = onOpenChange;
  const shown = open ? panel : null;
  const yours = reactions.yours;
  const summary = reactionSummary(reactions.counts);
  const selected = !ownWorkout && REACTIONS.find((entry) => entry.kind === yours);
  const comments = reactions.comment_count ?? 0;
  const commentLabel = `${comments} ${comments === 1 ? 'comment' : 'comments'}`;
  const reactionCount = `${summary.total} ${summary.total === 1 ? 'reaction' : 'reactions'}`;

  function show(next: Panel | null) {
    setPanel(next);
    setError(null);
    if (next === 'comments') setVisited(true);
    onOpenChange(next !== null);
  }

  useEffect(() => {
    if (!shown && restoreReactFocus.current) {
      restoreReactFocus.current = false;
      reactTrigger.current?.focus();
    }
  }, [shown, yours]);

  useEffect(() => {
    if (!shown || shown === 'people') return;
    if (shown === 'reactions') {
      const selectedButton =
        picker.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      (selectedButton ?? picker.current?.querySelector<HTMLButtonElement>('button'))?.focus();
    }
    const trigger = shown === 'reactions' ? reactTrigger : commentTrigger;
    function outside(event: PointerEvent) {
      if (container.current?.contains(event.target as Node)) return;
      setPanel(null);
      closeRef.current(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setPanel(null);
      closeRef.current(false);
      trigger.current?.focus();
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [shown]);

  async function react(chosen: (typeof REACTIONS)[number]['kind']) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = nextReaction(yours, chosen);
      const updated = next
        ? await api.sharing.react(workoutId, next)
        : await api.sharing.removeReaction(workoutId);
      restoreReactFocus.current = true;
      onChange(updated);
      show(null);
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const reactButton = (
    <button
      ref={reactTrigger}
      type="button"
      className="discussion-button friend-react-button"
      aria-label={
        selected
          ? `Your reaction to ${subject}: ${selected.label}. Change reaction`
          : `React to ${subject}`
      }
      aria-description={reactionCount}
      aria-expanded={shown === 'reactions'}
      aria-controls={`reactions-${workoutId}`}
      onClick={() => show(shown === 'reactions' ? null : 'reactions')}
    >
      {selected ? <span aria-hidden="true">{selected.emoji}</span> : <Icon name="react" />}
    </button>
  );

  return (
    <div ref={container} className="workout-discussion">
      <div className="workout-discussion-actions">
        {REACTIONS.map(({ kind, emoji, label }) => {
          const count = reactions.counts.find((entry) => entry.reaction === kind)?.count ?? 0;
          const mine = selected && yours === kind;
          if (count <= 0 && !mine) return null;
          const peopleButton = (
            <button
              key={kind}
              type="button"
              className={
                mine ? 'discussion-reaction-count' : 'discussion-button discussion-reaction-summary'
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
        {!ownWorkout && !selected && reactButton}
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
          {comments}
        </button>
      </div>
      {shown === 'people' && (
        <WorkoutReactionPeople
          workoutId={workoutId}
          onClose={() => {
            show(null);
            requestAnimationFrame(() => peopleTrigger.current?.focus());
          }}
        />
      )}
      {shown === 'reactions' && (
        <div
          ref={picker}
          id={`reactions-${workoutId}`}
          className="friend-react-picker"
          role="dialog"
          aria-label={`Choose a reaction to ${subject}`}
          aria-busy={busy}
        >
          {REACTIONS.map(({ kind, emoji, label }) => (
            <button
              key={kind}
              type="button"
              aria-label={label}
              aria-pressed={yours === kind}
              title={label}
              disabled={busy}
              onClick={() => void react(kind)}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
          {error && (
            <p className="inline-error friend-react-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      {(shown === 'comments' || visited) && (
        <div
          hidden={shown !== 'comments'}
          id={`discussion-${workoutId}`}
          className="workout-discussion-thread"
        >
          <WorkoutComments
            active={shown === 'comments'}
            workoutId={workoutId}
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
