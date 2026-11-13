import { useEffect, useState } from 'react';
import { useOffline } from './connectionStatus';

/** A flaky signal drops out for a few seconds at a time; only a lasting outage earns the pill. */
export const OFFLINE_NOTICE_DELAY_MS = 5000;
/** A dismissal lasts through short reconnections, so a patchy signal does not bring it back. */
export const OFFLINE_NOTICE_RESET_MS = 10_000;

type Phase = 'hidden' | 'shown' | 'dismissed';

/** Whether the app-wide offline pill is showing, and a way for the person to close it. */
export function useOfflineNotice() {
  const offline = useOffline();
  const [phase, setPhase] = useState<Phase>('hidden');

  useEffect(() => {
    if (offline) {
      const timer = window.setTimeout(
        () => setPhase((current) => (current === 'dismissed' ? current : 'shown')),
        OFFLINE_NOTICE_DELAY_MS,
      );
      return () => window.clearTimeout(timer);
    }
    // Reconnecting hides the pill straight away, so the next drop waits out the full delay
    // again instead of flashing the pill back the moment the signal blips.
    setPhase((current) => (current === 'shown' ? 'hidden' : current));
    const timer = window.setTimeout(() => setPhase('hidden'), OFFLINE_NOTICE_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [offline]);

  return {
    visible: offline && phase === 'shown',
    dismiss: () => setPhase('dismissed'),
  };
}
