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

// The open tour, whose account it is and its step, outside React: Home's header can remount while
// the tour moves between tabs, and the tour carries on from the same step. Only its own account
// sees it, and the sign-in screen closes it when a session ends.
type OpenTour = { userId: string; index: number };
let tour: OpenTour | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function setTour(next: OpenTour | null) {
  tour = next;
  listeners.forEach((listener) => listener());
}

/** Opens the tour from its start: for a new account, or Replay guide in Settings. */
export const startAppTour = (userId: string) => setTour({ userId, index: 0 });
export const replayAppTour = startAppTour;
export function showAppTourStep(userId: string, index: number) {
  if (tour?.userId === userId) setTour({ userId, index });
}
/** Closes the account's tour, or any open tour without one (a session ending). */
export function closeAppTour(userId?: string) {
  if (tour && (!userId || tour.userId === userId)) setTour(null);
}
/** The account's open tour, or null while it has none. */
export function useAppTour(userId: string): OpenTour | null {
  const current = useSyncExternalStore(subscribe, () => tour);
  return current?.userId === userId ? current : null;
}
