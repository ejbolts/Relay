import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { FinishedWorkout } from '../../../../frontend/src/finishedWorkoutQueue';
import { localDate } from '../../../../frontend/src/utils';
import { queryKeys } from '../../data/queries';

/**
 * A finished workout the server just confirmed. It leaves the queue at once, but the dashboard
 * loaded at that moment doesn't count it yet, so the review keeps counting it until that
 * dashboard is replaced, as the web's `savedPreviews` does.
 */
export interface JustSavedWorkout {
  owner: string;
  id: string;
  finished: FinishedWorkout;
  dashboard: unknown;
}

let saved: readonly JustSavedWorkout[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called once the server confirms a finished workout (WorkoutProvider's queue sender). */
export function rememberSavedWorkout(
  client: QueryClient,
  owner: string,
  id: string,
  finished: FinishedWorkout,
) {
  const dashboard = client.getQueryData(queryKeys.dashboard(localDate())) ?? null;
  // Entries for another account, or pinned to a dashboard since replaced, are no longer needed.
  saved = [
    ...saved.filter(
      (item) => item.owner === owner && item.id !== id && item.dashboard === dashboard,
    ),
    { owner, id, finished, dashboard },
  ];
  for (const listener of listeners) listener();
}

/** The account's saved workouts that `dashboard` doesn't include yet. */
export function awaitingDashboard(
  entries: readonly JustSavedWorkout[],
  owner: string,
  dashboard: unknown,
) {
  return entries.filter((item) => item.owner === owner && item.dashboard === (dashboard ?? null));
}

export function useJustSavedWorkouts() {
  return useSyncExternalStore(subscribe, () => saved);
}

/** For tests. */
export function forgetJustSavedWorkouts() {
  saved = [];
  for (const listener of listeners) listener();
}
