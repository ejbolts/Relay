import type { SocialNotificationRow } from './notificationInbox';

/** A workout to reveal in Social's feed, such as one opened from a notification. */
export interface WorkoutFocus {
  workoutId: string;
  /** Titles the thread when the workout is no longer in the loaded feed. */
  workoutName: string;
  /** The reactions sheet or the comment thread to open on its card. */
  panel: 'people' | 'comments';
  /** The person whose reaction to highlight in the reactions sheet. */
  personId?: string;
  /** The comment to highlight in the thread. */
  commentId?: string;
  /** Distinguishes repeated requests for the same workout. */
  key: number;
}

/** Older feed pages loaded while looking for a workout opened from a notification. */
export const FOCUS_SEARCH_PAGES = 5;
/** How long a revealed card stays highlighted. */
export const FOCUS_HIGHLIGHT_MS = 2400;

let current: WorkoutFocus | null = null;
let sequence = 0;
const listeners = new Set<() => void>();

export function subscribeWorkoutFocus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The waiting request, if any. */
export function currentWorkoutFocus(): WorkoutFocus | null {
  return current;
}

/** Opens Social's feed at a workout. The request waits until the feed has handled it. */
export function requestWorkoutFocus(target: Omit<WorkoutFocus, 'key'>): void {
  current = { ...target, key: ++sequence };
  listeners.forEach((listener) => listener());
}

/** Marks a request handled, unless a newer one has replaced it. */
export function clearWorkoutFocus(key: number): void {
  if (current?.key !== key) return;
  current = null;
  listeners.forEach((listener) => listener());
}

/** Runs when a request arrives, for the app to switch to Social. */
export function onWorkoutFocusRequested(listener: () => void): () => void {
  const notify = () => {
    if (current) listener();
  };
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/**
 * What the feed does next with a request: reveal the workout's card, load an older page to look
 * for it, or (once enough pages have been searched) open its reactions or comments on their own.
 */
export function workoutFocusStep(
  focus: Pick<WorkoutFocus, 'workoutId'>,
  feed: { workoutIds: readonly string[]; hasMore: boolean; pagesSearched: number },
): 'reveal' | 'load-more' | 'detached' {
  if (feed.workoutIds.includes(focus.workoutId)) return 'reveal';
  return feed.hasMore && feed.pagesSearched < FOCUS_SEARCH_PAGES ? 'load-more' : 'detached';
}

/**
 * The workout a reaction or comment notice opens: its reactions with that person's highlighted,
 * or its comments at that comment. Friend requests and accepted requests open a profile instead.
 */
export function notificationWorkoutFocus(
  row: SocialNotificationRow,
): Omit<WorkoutFocus, 'key'> | null {
  if (row.kind === 'reaction')
    return {
      workoutId: row.item.workout_id,
      workoutName: row.item.workout_name,
      panel: 'people',
      personId: row.item.id,
    };
  if (row.kind === 'comment')
    return {
      workoutId: row.item.workout_id,
      workoutName: row.item.workout_name,
      panel: 'comments',
      commentId: row.item.comment_id,
    };
  return null;
}
