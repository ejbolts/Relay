import type { WorkoutComment } from './types';
import { localDate, localDateOf } from './utils';

/** The longest comment, in characters (emoji count once). */
export const COMMENT_MAX_LENGTH = 280;

/** A comment's length as the server counts it: one per character, emoji included. */
export function commentLength(body: string): number {
  return Array.from(body).length;
}

/** Typing beyond the limit is cut off at it. */
export function clampComment(body: string): string {
  return Array.from(body).slice(0, COMMENT_MAX_LENGTH).join('');
}

/** Whether a draft can be sent: something besides spaces, within the limit. */
export function canSendComment(body: string): boolean {
  return body.trim().length > 0 && commentLength(body) <= COMMENT_MAX_LENGTH;
}

/** A comment's time, with its day when it was not posted today. */
export function commentTime(createdAt: string, today = localDate()): string {
  const posted = new Date(createdAt);
  const time = posted.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (localDateOf(createdAt) === today) return time;
  const day = posted.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    ...(posted.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  });
  return `${day}, ${time}`;
}

/** Top-level comments in order, each with its replies. */
export function commentThreads(
  items: WorkoutComment[],
): Array<{ root: WorkoutComment; replies: WorkoutComment[] }> {
  return items
    .filter((item) => !item.parent_id)
    .map((root) => ({ root, replies: items.filter((item) => item.parent_id === root.id) }));
}

/** Replies shown under a comment before the rest fold behind a "+N replies" button. */
export const SHOWN_REPLIES = 2;

/**
 * The replies to show under a comment and how many are folded away. An expanded thread, or one
 * holding a highlighted reply (opened from a notification), shows them all.
 */
export function visibleReplies(
  replies: WorkoutComment[],
  expanded: boolean,
  highlightId?: string | null,
): { shown: WorkoutComment[]; hidden: number } {
  const folded = replies.slice(SHOWN_REPLIES);
  if (expanded || !folded.length || folded.some((item) => item.id === highlightId))
    return { shown: replies, hidden: 0 };
  return { shown: replies.slice(0, SHOWN_REPLIES), hidden: folded.length };
}

/** The button that unfolds a thread's other replies: "+1 reply", "+3 replies". */
export function moreRepliesLabel(hidden: number): string {
  return `+${hidden} ${hidden === 1 ? 'reply' : 'replies'}`;
}

/** The thread a comment belongs to: its own id, or its top-level comment's for a reply. */
export function threadRoot(comment: WorkoutComment): string {
  return comment.parent_id ?? comment.id;
}

/** What deleting a comment removes, for its confirmation. */
export function deleteCommentMessage(items: WorkoutComment[], comment: WorkoutComment): string {
  return items.some((item) => item.parent_id === comment.id)
    ? 'This comment and its replies will be permanently deleted.'
    : 'This comment will be permanently deleted.';
}
