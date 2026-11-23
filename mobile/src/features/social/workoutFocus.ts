import { useSyncExternalStore } from 'react';
import {
  currentWorkoutFocus,
  subscribeWorkoutFocus,
  type WorkoutFocus,
} from '../../../../frontend/src/workoutFocusRequest';

export {
  clearWorkoutFocus,
  onWorkoutFocusRequested,
  requestWorkoutFocus,
  type WorkoutFocus,
} from '../../../../frontend/src/workoutFocusRequest';

/** A workout opened from a notification, waiting for Social's feed to find it. */
export function useWorkoutFocus(): WorkoutFocus | null {
  return useSyncExternalStore(subscribeWorkoutFocus, currentWorkoutFocus);
}

/**
 * The request the feed has handled and is showing: its card's reactions sheet (`reveal`), or its
 * reactions or comments on their own when it isn't in the loaded feed (`detached`).
 */
export interface ShownFocus extends WorkoutFocus {
  mode: 'reveal' | 'detached';
}

let shown: ShownFocus | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function showWorkoutFocus(focus: WorkoutFocus, mode: ShownFocus['mode']) {
  shown = { ...focus, mode };
  listeners.forEach((listener) => listener());
}

/** Closes what a request opened, unless a newer one has replaced it. */
export function dismissWorkoutFocus(key: number) {
  if (shown?.key !== key) return;
  shown = null;
  listeners.forEach((listener) => listener());
}

export function currentShownWorkoutFocus(): ShownFocus | null {
  return shown;
}

export function useShownWorkoutFocus(): ShownFocus | null {
  return useSyncExternalStore(subscribe, () => shown);
}
