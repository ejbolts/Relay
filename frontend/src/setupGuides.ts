import { useSyncExternalStore } from 'react';
import type { TrackedWorkout } from './types';

import { guideFacts, type GuideFacts, type SetupGuideId } from './setupGuideSteps';

export {
  favouriteLift,
  GUIDE_FOR_TIP,
  recentRotation,
  SETUP_GUIDE_IDS,
  type FavouriteLift,
  type GuideFacts,
  type SetupGuideId,
} from './setupGuideSteps';

const EVENT = 'relay:setup-guide';

export function openSetupGuide(id: SetupGuideId) {
  window.dispatchEvent(new CustomEvent<SetupGuideId>(EVENT, { detail: id }));
}

export function onSetupGuide(listener: (id: SetupGuideId) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<SetupGuideId>).detail);
  window.addEventListener(EVENT, handle);
  return () => window.removeEventListener(EVENT, handle);
}

export interface ActiveGuide {
  id: SetupGuideId;
  facts: GuideFacts;
  /** Splits: a saved split still to be made active, after the editor closes. */
  useRoutineId?: string;
}

let active: ActiveGuide | null = null;
const listeners = new Set<() => void>();
const finishedListeners = new Set<(id: SetupGuideId) => void>();

function emit(next: ActiveGuide | null) {
  active = next;
  for (const listener of listeners) listener();
}

/** The running guide, outside React. */
export const activeGuide = () => active;

export function startGuide(id: SetupGuideId, workouts: TrackedWorkout[]) {
  emit({ id, facts: guideFacts(workouts) });
}

export function updateGuide(id: SetupGuideId, change: Partial<Omit<ActiveGuide, 'id'>>) {
  if (active?.id === id) emit({ ...active, ...change });
}

/** Leaves a guide part way; nothing is marked as set up. */
export function exitGuide(id?: SetupGuideId) {
  if (active && (!id || active.id === id)) emit(null);
}

/** The feature was saved: the guide is complete. */
export function finishGuide(id: SetupGuideId) {
  if (active?.id !== id) return;
  emit(null);
  for (const listener of finishedListeners) listener(id);
}

export function onGuideFinished(listener: (id: SetupGuideId) => void): () => void {
  finishedListeners.add(listener);
  return () => finishedListeners.delete(listener);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The running guide, or only the named one when an id is given. */
export function useActiveGuide(id?: SetupGuideId): ActiveGuide | null {
  const current = useSyncExternalStore(
    subscribe,
    () => active,
    // Nothing runs a guide while the page is rendered on the server.
    () => null,
  );
  return current && (!id || current.id === id) ? current : null;
}
