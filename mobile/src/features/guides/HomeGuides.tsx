import { useEffect } from 'react';
import { useUser } from '../../session/SessionProvider';
import { openLaunchPrompt } from '../review/noticeMemory';
import { AppTour } from './AppTour';
import {
  appTourWaiting,
  closeAppTour,
  finishAppTour,
  showAppTourStep,
  startAppTour,
  useAppTour,
} from './tourProgress';
import { HomeTipsButton } from './HomeTipsButton';
import { useTipReminders } from './tips';

/**
 * Home's guides, mounted with one line in Home's header: the tips bulb and the quick tour for a
 * new account (or when Settings replays it).
 */
export function HomeGuides() {
  const user = useUser();
  const tour = useAppTour(user.id);
  useEffect(() => {
    // Opened once for a new account, as this visit's one launch prompt (What's new and the weekly
    // review wait for a later visit); finishing or skipping it marks it done.
    if (appTourWaiting(user.id) && !tour) {
      openLaunchPrompt(user.id, 'onboarding');
      startAppTour(user.id);
    }
  }, [user.id, tour]);
  useTipReminders(user.id);
  return (
    <>
      <HomeTipsButton />
      {tour && (
        <AppTour
          index={tour.index}
          onStep={(index) => showAppTourStep(user.id, index)}
          onClose={() => {
            finishAppTour(user.id);
            closeAppTour(user.id);
          }}
        />
      )}
    </>
  );
}
