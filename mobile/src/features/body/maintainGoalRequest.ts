import { useSyncExternalStore } from 'react';

// Home's maintenance tip opens Body's goal form on Maintain, as the web's tip does. Body is a tab,
// so the request waits here until Body shows the form.

let requested = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function requestMaintainGoal() {
  requested = true;
  emit();
}

export function clearMaintainGoalRequest() {
  if (!requested) return;
  requested = false;
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useMaintainGoalRequested = () => useSyncExternalStore(subscribe, () => requested);
