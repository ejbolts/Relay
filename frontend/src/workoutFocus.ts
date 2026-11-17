import { useSyncExternalStore } from 'react';

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

let current: WorkoutFocus | null = null;
let sequence = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
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

const snapshot = () => current;
/** No request can be waiting while the page is first rendered on the server. */
const serverSnapshot = () => null;

/** The waiting request, if any. */
export function useWorkoutFocus(): WorkoutFocus | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Runs when a request arrives, for the app to switch to Social. */
export function onWorkoutFocusRequested(listener: () => void): () => void {
  const notify = () => {
    if (current) listener();
  };
  listeners.add(notify);
  return () => listeners.delete(notify);
}
