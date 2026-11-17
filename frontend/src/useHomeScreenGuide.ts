import { useState } from 'react';
import { finishHomeScreenGuide, homeScreenGuideWaiting } from './homeScreenGuideState';

/** Opens once for a new account after the release check, or whenever Settings asks for it. */
export function useHomeScreenGuide(userId: string | null, releaseChecked: boolean) {
  const [waiting, setWaiting] = useState(() => userId !== null && homeScreenGuideWaiting(userId));
  const [requested, setRequested] = useState(false);

  return {
    open: requested || (waiting && releaseChecked),
    show: () => setRequested(true),
    dismiss: () => {
      if (userId) finishHomeScreenGuide(userId);
      setWaiting(false);
      setRequested(false);
    },
  };
}
