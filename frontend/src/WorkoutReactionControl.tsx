import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { nextReaction, reactionEmoji, reactionSummary, REACTIONS } from './friendFeedData';
import { Icon } from './Icon';
import type { WorkoutReactions, WorkoutComment } from './types';
import { WorkoutComments } from './WorkoutComments';

type Panel = 'reactions' | 'comments';

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
  const closeRef = useRef(onOpenChange);
  closeRef.current = onOpenChange;
  const shown = open ? panel : null;
  const yours = reactions.yours;
  const summary = reactionSummary(reactions.counts);
  const selected = REACTIONS.find((entry) => entry.kind === yours);
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
    if (!shown) return;
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
      onChange(
        next
          ? await api.sharing.react(workoutId, next)
          : await api.sharing.removeReaction(workoutId),
      );
      show(null);
      reactTrigger.current?.focus();
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const reactionContent =
    summary.total > 0 ? (
      <>
        <span aria-hidden="true">{summary.emojis.join('')}</span> {summary.total}
      </>
    ) : yours ? (
      <span aria-hidden="true">{reactionEmoji(yours)}</span>
    ) : (
      <Icon name="react" />
    );

  return (
    <div ref={container} className="workout-discussion">
      <div className="workout-discussion-actions">
        {ownWorkout ? (
          summary.total > 0 && (
            <span
              className="discussion-button discussion-reaction-summary"
              role="img"
              aria-label={reactionCount}
            >
              {reactionContent}
            </span>
          )
        ) : (
          <button
            ref={reactTrigger}
            type="button"
            className={`discussion-button friend-react-button${yours ? ' is-yours' : ''}`}
            aria-label={
              yours
                ? `Your reaction to ${subject}: ${selected?.label}. Change reaction`
                : `React to ${subject}`
            }
            aria-description={reactionCount}
            aria-expanded={shown === 'reactions'}
            aria-controls={`reactions-${workoutId}`}
            onClick={() => show(shown === 'reactions' ? null : 'reactions')}
          >
            {reactionContent}
          </button>
        )}
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
          {commentLabel}
        </button>
      </div>
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
