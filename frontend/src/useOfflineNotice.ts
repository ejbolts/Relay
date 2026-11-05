import { useEffect, useState } from 'react';
import { useOffline } from './connectionStatus';

/** A brief blip should not slide the whole app down and back up. */
export const OFFLINE_NOTICE_DELAY_MS = 1500;
/** A dismissal lasts through short reconnections, so a patchy signal does not bring it back. */
export const OFFLINE_NOTICE_RESET_MS = 10_000;

type Phase = 'hidden' | 'shown' | 'dismissed';

/** Whether the app-wide offline strip is showing, and a way for the person to close it. */
export function useOfflineNotice() {
  const offline = useOffline();
  const [phase, setPhase] = useState<Phase>('hidden');

  useEffect(() => {
    const timer = offline
      ? window.setTimeout(
          () => setPhase((current) => (current === 'dismissed' ? current : 'shown')),
          OFFLINE_NOTICE_DELAY_MS,
        )
      : window.setTimeout(() => setPhase('hidden'), OFFLINE_NOTICE_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [offline]);

  return {
    visible: offline && phase === 'shown',
    dismiss: () => setPhase('dismissed'),
  };
}
