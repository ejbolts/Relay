import { useEffect } from 'react';
import { useUser } from '../../session/SessionProvider';
import { openLaunchPrompt } from '../review/noticeMemory';
import { AppTour } from './AppTour';
import {
  appTourWaiting,
  closeAppTour,
  finishAppTour,
  startAppTour,
  useAppTour,
} from './tourProgress';
import { HomeTipsButton } from './HomeTipsButton';
import { useInactiveWorkoutAlert } from './workoutAlerts';

/**
 * Home's guides, mounted with one line in Home's header: the tips bulb, the quick tour for a new
 * account (or when Settings replays it), and the "Still working out?" alert.
 */
export function HomeGuides() {
  const user = useUser();
  const tour = useAppTour();
  useEffect(() => {
    // Opened once for a new account, as this visit's one launch prompt (What's new and the weekly
    // review wait for a later visit); finishing or skipping it marks it done.
    if (appTourWaiting(user.id) && !tour) {
      openLaunchPrompt(user.id, 'onboarding');
      startAppTour();
    }
  }, [user.id, tour]);
  useInactiveWorkoutAlert();
  return (
    <>
      <HomeTipsButton />
      {tour && (
        <AppTour
          index={tour.index}
          onClose={() => {
            finishAppTour(user.id);
            closeAppTour();
          }}
        />
      )}
    </>
  );
}
