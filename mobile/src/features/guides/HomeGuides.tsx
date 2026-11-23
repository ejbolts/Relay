import { useState } from 'react';
import { useUser } from '../../session/SessionProvider';
import { AppTour } from './AppTour';
import { appTourWaiting, closeAppTour, finishAppTour, useAppTourRequested } from './tourProgress';
import { HomeTipsButton } from './HomeTipsButton';
import { useInactiveWorkoutAlert } from './workoutAlerts';

/**
 * Home's guides, mounted with one line in Home's header: the tips bulb, the quick tour for a new
 * account (or when Settings replays it), and the "Still working out?" alert.
 */
export function HomeGuides() {
  const user = useUser();
  const requested = useAppTourRequested();
  const [waiting, setWaiting] = useState(() => appTourWaiting(user.id));
  useInactiveWorkoutAlert();
  return (
    <>
      <HomeTipsButton />
      {(waiting || requested) && (
        <AppTour
          onClose={() => {
            finishAppTour(user.id);
            setWaiting(false);
            closeAppTour();
          }}
        />
      )}
    </>
  );
}
