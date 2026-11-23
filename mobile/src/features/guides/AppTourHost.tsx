import { useUser } from '../../session/SessionProvider';
import { AppTour } from './AppTour';
import { closeAppTour, finishAppTour, showAppTourStep, useAppTour } from './tourProgress';

/**
 * The quick tour, mounted once above the navigator so it stays open while it opens each tab and
 * Settings. Home starts it; a modal shown from inside a tab is dismissed when its tab is left.
 */
export function AppTourHost() {
  const user = useUser();
  const tour = useAppTour(user.id);
  if (!tour) return null;
  return (
    <AppTour
      index={tour.index}
      onStep={(index) => showAppTourStep(user.id, index)}
      onClose={() => {
        finishAppTour(user.id);
        closeAppTour(user.id);
      }}
    />
  );
}
