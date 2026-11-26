import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { reactionChoice, reactionEmoji } from './friendFeedData';
import { Icon } from './Icon';
import { motionReduced } from './motion';
import { useHeightAnimation } from './motionHooks';
import { ProfileAvatar } from './ProfileAvatar';
import { PopupDialog } from './PopupDialog';
import { ShowMoreButton } from './ShowMoreButton';
import type { WorkoutComment, WorkoutReactionKind, WorkoutReactions } from './types';
import {
  canSendComment,
  clampComment,
  commentLength,
  commentThreads,
  commentTime,
  COMMENT_MAX_LENGTH,
  deleteCommentMessage,
} from './commentDisplay';

// Loaded when first opened, so the emoji catalogue stays out of the app's first download.
const EmojiReactionSheet = lazy(() => import('./EmojiReactionSheet'));

export function WorkoutComments({
  workoutId,
  onOpenMember,
  onCountChange,
  active = true,
  focusComment,
  onLayoutChange,
}: {
  workoutId: string;
  /** A comment to find, scroll to and highlight, such as one opened from a notification. */
  focusComment?: string;
  onOpenMember?: (person: WorkoutComment['author']) => void;
  onCountChange: (count: number, summary?: WorkoutReactions) => void;
  active?: boolean;
  /** Let an enclosing card own the height glide, including asynchronous comment loads. */
  onLayoutChange?: (key: string) => void;
}) {
  const [items, setItems] = useState<WorkoutComment[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [reply, setReply] = useState<WorkoutComment | null>(null);
  const [editing, setEditing] = useState<WorkoutComment | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<WorkoutComment | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const focused = useRef<HTMLElement>(null);
  const section = useRef<HTMLElement>(null);
  const layoutKey = JSON.stringify([
    active,
    loading,
    items.map((item) => [item.id, item.body, item.reactions.counts]),
    picker,
    reply?.id,
    editing?.id,
    next,
    error,
  ]);
  useHeightAnimation(section, onLayoutChange ? '' : layoutKey);
  useLayoutEffect(() => onLayoutChange?.(layoutKey), [layoutKey, onLayoutChange]);
  const countRef = useRef(onCountChange);
  countRef.current = onCountChange;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      let page = await api.sharing.comments(workoutId);
      const rows = [...page.items];
      // Load further pages only until the comment being opened appears.
      while (
        focusComment &&
        page.next_offset !== null &&
        !rows.some((row) => row.id === focusComment)
      ) {
        page = await api.sharing.comments(workoutId, page.next_offset);
        rows.push(...page.items);
      }
      return { page, rows };
    })()
      .then(({ page, rows }) => {
        if (cancelled) return;
        setItems(rows);
        setNext(page.next_offset);
        countRef.current(page.total, page.reactions);
      })
      .catch((reason) => {
        if (!cancelled) setError(authErrorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workoutId, active, focusComment]);

  useEffect(() => {
    if (loading || !focusComment) return;
    // After the card that holds the thread has scrolled into view.
    const frame = requestAnimationFrame(() =>
      focused.current?.scrollIntoView?.({
        block: 'center',
        behavior: motionReduced() ? 'auto' : 'smooth',
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [loading, focusComment]);

  async function refresh() {
    // Retain all loaded roots after mutations.
    let offset: number | null = 0;
    const rows: WorkoutComment[] = [];
    do {
      const page = await api.sharing.comments(workoutId, offset);
      rows.push(...page.items);
      countRef.current(page.total, page.reactions);
      offset = page.next_offset;
    } while (offset !== null && rows.length < items.length + 1);
    setItems(rows);
    setNext(offset);
  }
  function react(item: WorkoutComment, reaction: WorkoutReactionKind | null, close = false) {
    void run(async () => {
      const updated = await api.sharing.reactToComment(item.id, reaction);
      setItems((current) => current.map((row) => (row.id === item.id ? updated : row)));
      if (close) setPicker(null);
    });
  }
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  function member(person: WorkoutComment['author'], mention = false) {
    return (
      <button
        type="button"
        className="comment-person"
        onClick={() => onOpenMember?.(person)}
        aria-label={`Open ${person.display_name}'s profile`}
      >
        {mention ? '@' : ''}
        {person.display_name}
      </button>
    );
  }
  function renderComment(item: WorkoutComment) {
    return (
      <article
        key={item.id}
        ref={item.id === focusComment ? focused : undefined}
        className={`workout-comment${item.id === focusComment ? ' is-highlighted' : ''}`}
      >
        <ProfileAvatar
          className="shared-profile-avatar small"
          user={{ ...item.author, username: '' }}
        />
        <div className="comment-content">
          <div className="comment-bubble">
            {member(item.author)}{' '}
            {item.reaction && (
              <span className="comment-attached-reaction">
                reacted {reactionEmoji(item.reaction)}
              </span>
            )}
            <p>
              {item.reply_to && <>{member(item.reply_to, true)} </>}
              {item.body}
            </p>
          </div>
          <div className="comment-actions">
            <time dateTime={item.created_at}>
              {commentTime(item.created_at)}
              {item.edited_at ? ' · edited' : ''}
            </time>
            <button
              type="button"
              className="pulse-button link small"
              aria-haspopup="dialog"
              aria-expanded={picker === item.id}
              onClick={() => {
                setError(null);
                setPicker(picker === item.id ? null : item.id);
              }}
            >
              React
            </button>
            <button
              type="button"
              className="pulse-button link small"
              onClick={() => {
                setReply(item);
                setEditing(null);
                input.current?.focus();
              }}
            >
              Reply
            </button>
            {item.can_edit && (
              <button
                type="button"
                className="pulse-button link small"
                onClick={() => {
                  setEditing(item);
                  setBody(item.body);
                  setReply(null);
                  input.current?.focus();
                }}
              >
                Edit
              </button>
            )}
            {item.can_delete && (
              <button
                type="button"
                className="pulse-button link small comment-delete"
                disabled={busy}
                onClick={() => setDeleting(item)}
              >
                Delete
              </button>
            )}
            {item.reactions.counts.map((rx) => (
              <button
                type="button"
                key={rx.reaction}
                className="comment-reaction"
                aria-label={`${reactionChoice(rx.reaction)?.label ?? rx.reaction}, ${rx.count}`}
                aria-pressed={item.reactions.yours === rx.reaction}
                disabled={busy}
                onClick={() =>
                  react(item, item.reactions.yours === rx.reaction ? null : rx.reaction)
                }
              >
                {reactionEmoji(rx.reaction)} {rx.count}
              </button>
            ))}
          </div>
          {picker === item.id && (
            <Suspense fallback={null}>
              <EmojiReactionSheet
                title={`React to ${item.author.display_name}'s comment`}
                yours={item.reactions.yours}
                busy={busy}
                error={error}
                onChoose={(reaction) => react(item, reaction, true)}
                onClose={() => setPicker(null)}
              />
            </Suspense>
          )}
        </div>
      </article>
    );
  }
  return (
    <section ref={section} className="workout-comments" aria-label="Workout comments">
      {deleting && (
        <PopupDialog
          title="Delete comment?"
          className="comment-delete-dialog"
          size="compact"
          busy={busy}
          onClose={() => setDeleting(null)}
          actions={
            <>
              <button type="button" autoFocus disabled={busy} onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="popup-primary-action is-danger comment-delete-confirm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api.sharing.deleteComment(deleting.id);
                    setDeleting(null);
                    await refresh();
                  })
                }
              >
                Delete
              </button>
            </>
          }
        >
          <p>{deleteCommentMessage(items, deleting)}</p>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </PopupDialog>
      )}
      {loading ? (
        <p role="status">Loading comments…</p>
      ) : (
        commentThreads(items).map(({ root, replies }) => (
          <div key={root.id}>
            {renderComment(root)}
            <div className="comment-replies">{replies.map(renderComment)}</div>
          </div>
        ))
      )}
      {next !== null && (
        <ShowMoreButton
          loading={loadingMore}
          onClick={() => {
            setLoadingMore(true);
            void run(async () => {
              const page = await api.sharing.comments(workoutId, next);
              setItems((current) => [...current, ...page.items]);
              setNext(page.next_offset);
              countRef.current(page.total);
            }).finally(() => setLoadingMore(false));
          }}
        />
      )}
      {(reply || editing) && (
        <div className="comment-replying">
          {editing ? 'Editing comment' : <>Replying to {member(reply!.author, true)}</>}
          <button
            type="button"
            className="pulse-button small icon-only"
            aria-label="Cancel comment reply or edit"
            onClick={() => {
              setReply(null);
              setEditing(null);
              setBody('');
            }}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      <form
        className="comment-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSendComment(body)) return;
          void run(async () => {
            if (editing) await api.sharing.editComment(editing.id, body);
            else await api.sharing.addComment(workoutId, body, reply?.id ?? null, null);
            setBody('');
            setReply(null);
            setEditing(null);
            await refresh();
          });
        }}
      >
        <textarea
          ref={input}
          aria-label="Comment"
          placeholder={reply ? 'Write a reply…' : 'Write a comment…'}
          value={body}
          rows={2}
          onChange={(event) => setBody(clampComment(event.target.value))}
          disabled={loading || busy}
        />
        <button
          type="submit"
          className="profile-primary"
          disabled={loading || busy || !body.trim()}
        >
          {busy ? 'Saving…' : editing ? 'Save' : 'Send'}
        </button>
        <span className="comment-length" aria-live="polite">
          {commentLength(body)}/{COMMENT_MAX_LENGTH}
        </span>
      </form>
      {error && (
        <p className="inline-error" role="alert">
          {error}
          <button
            type="button"
            className="pulse-button link small"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await refresh();
                setLoading(false);
              })
            }
          >
            Retry
          </button>
        </p>
      )}
    </section>
  );
}
