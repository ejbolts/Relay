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

let requested = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function setRequested(value: boolean) {
  requested = value;
  listeners.forEach((listener) => listener());
}

/** Replay guide, from Settings: Home shows the tour from its start. */
export const replayAppTour = () => setRequested(true);
export const closeAppTour = () => setRequested(false);
export const useAppTourRequested = () => useSyncExternalStore(subscribe, () => requested);
