import { useSyncExternalStore } from 'react';
import type { TrackedWorkout } from './types';

import { setupGuideRun, type ActiveGuide } from './setupGuideRun';
import { guideFacts, type SetupGuideId } from './setupGuideSteps';

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

export type { ActiveGuide } from './setupGuideRun';

const run = setupGuideRun();

/** The running guide, outside React. */
export const activeGuide = run.get;

export function startGuide(id: SetupGuideId, workouts: TrackedWorkout[]) {
  run.start(id, guideFacts(workouts));
}

export const updateGuide = run.update;

/** Leaves a guide part way; nothing is marked as set up. */
export const exitGuide = run.exit;

/** The feature was saved: the guide is complete. */
export const finishGuide = run.finish;

export const onGuideFinished = run.onFinished;

/** The running guide, or only the named one when an id is given. */
export function useActiveGuide(id?: SetupGuideId): ActiveGuide | null {
  const current = useSyncExternalStore(
    run.subscribe,
    run.get,
    // Nothing runs a guide while the page is rendered on the server.
    () => null,
  );
  return current && (!id || current.id === id) ? current : null;
}
