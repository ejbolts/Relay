import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { REACTIONS, reactionEmoji } from './friendFeedData';
import { ProfileAvatar } from './ProfileAvatar';
import { PopupDialog } from './PopupDialog';
import type { WorkoutComment, WorkoutReactions } from './types';

export function WorkoutComments({
  workoutId,
  onOpenMember,
  onCountChange,
  active = true,
}: {
  workoutId: string;
  onOpenMember?: (person: WorkoutComment['author']) => void;
  onCountChange: (count: number, summary?: WorkoutReactions) => void;
  active?: boolean;
}) {
  const [items, setItems] = useState<WorkoutComment[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [reply, setReply] = useState<WorkoutComment | null>(null);
  const [editing, setEditing] = useState<WorkoutComment | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<WorkoutComment | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const countRef = useRef(onCountChange);
  countRef.current = onCountChange;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    api.sharing
      .comments(workoutId)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
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
  }, [workoutId, active]);

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
      <article key={item.id} className="workout-comment">
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
              {new Date(item.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {item.edited_at ? ' · edited' : ''}
            </time>
            <button
              type="button"
              aria-expanded={picker === item.id}
              onClick={() => setPicker(picker === item.id ? null : item.id)}
            >
              React
            </button>
            <button
              type="button"
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
              <button type="button" disabled={busy} onClick={() => setDeleting(item)}>
                Delete
              </button>
            )}
            {item.reactions.counts.map((rx) => (
              <button
                type="button"
                key={rx.reaction}
                className="comment-reaction"
                aria-label={`${rx.reaction}, ${rx.count}`}
                aria-pressed={item.reactions.yours === rx.reaction}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const updated = await api.sharing.reactToComment(
                      item.id,
                      item.reactions.yours === rx.reaction ? null : rx.reaction,
                    );
                    setItems((current) =>
                      current.map((row) => (row.id === item.id ? updated : row)),
                    );
                  })
                }
              >
                {reactionEmoji(rx.reaction)} {rx.count}
              </button>
            ))}
          </div>
          {picker === item.id && (
            <div
              className="comment-emoji-picker"
              role="group"
              aria-label={`React to ${item.author.display_name}'s comment`}
            >
              {REACTIONS.map((rx) => (
                <button
                  key={rx.kind}
                  type="button"
                  aria-label={rx.label}
                  aria-pressed={item.reactions.yours === rx.kind}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const updated = await api.sharing.reactToComment(
                        item.id,
                        item.reactions.yours === rx.kind ? null : rx.kind,
                      );
                      setItems((current) =>
                        current.map((row) => (row.id === item.id ? updated : row)),
                      );
                      setPicker(null);
                    })
                  }
                >
                  {rx.emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </article>
    );
  }
  return (
    <section className="workout-comments" aria-label="Workout comments">
      {deleting && (
        <PopupDialog title="Delete comment?" onClose={() => !busy && setDeleting(null)}>
          <p>
            {deleting.parent_id
              ? 'This comment will be permanently deleted.'
              : 'This comment and its replies will be permanently deleted.'}
          </p>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="profile-actions">
            <button
              type="button"
              className="profile-secondary"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="profile-primary"
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
          </div>
        </PopupDialog>
      )}
      {loading ? (
        <p role="status">Loading comments…</p>
      ) : (
        items
          .filter((item) => !item.parent_id)
          .map((root) => (
            <div key={root.id}>
              {renderComment(root)}
              <div className="comment-replies">
                {items.filter((item) => item.parent_id === root.id).map(renderComment)}
              </div>
            </div>
          ))
      )}
      {next !== null && (
        <button
          type="button"
          className="text-link"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const page = await api.sharing.comments(workoutId, next);
              setItems((current) => [...current, ...page.items]);
              setNext(page.next_offset);
              countRef.current(page.total);
            })
          }
        >
          Show more comments
        </button>
      )}
      {(reply || editing) && (
        <div className="comment-replying">
          {editing ? 'Editing comment' : <>Replying to {member(reply!.author, true)}</>}
          <button
            type="button"
            aria-label="Cancel comment reply or edit"
            onClick={() => {
              setReply(null);
              setEditing(null);
              setBody('');
            }}
          >
            ×
          </button>
        </div>
      )}
      <form
        className="comment-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!body.trim() || Array.from(body).length > 280) return;
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
          onChange={(event) => setBody(Array.from(event.target.value).slice(0, 280).join(''))}
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
          {Array.from(body).length}/280
        </span>
      </form>
      {error && (
        <p className="inline-error" role="alert">
          {error}
          <button
            type="button"
            className="text-link"
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
