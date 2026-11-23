import { useSyncExternalStore } from 'react';
import { appGuideProgress } from '../../../../frontend/src/appGuideProgress';
import { deviceStorage } from '../../data/deviceStorage';

// The quick tour's progress for each account on this phone. The web follows a first tour with
// its import step; the app's imports are on the web, so the tour ends the guide here.
const progress = appGuideProgress(() => deviceStorage);

/** A new account takes the tour on its first Home. */
export const queueAppTour = progress.queueAppGuide;
export const appTourWaiting = progress.appGuideWaiting;
export const finishAppTour = progress.finishAppGuide;

// The open tour and its step, outside React: Home's header can remount while the tour moves
// between tabs, and the tour carries on from the same step.
let tour: { index: number } | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function setTour(next: { index: number } | null) {
  tour = next;
  listeners.forEach((listener) => listener());
}

/** Opens the tour from its start: for a new account, or Replay guide in Settings. */
export const startAppTour = () => setTour({ index: 0 });
export const replayAppTour = startAppTour;
export const showAppTourStep = (index: number) => setTour({ index });
export const closeAppTour = () => setTour(null);
/** The open tour's step, or null while it is closed. */
export const useAppTour = () => useSyncExternalStore(subscribe, () => tour);
