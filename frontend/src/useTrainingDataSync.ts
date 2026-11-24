import { useEffect, useRef } from 'react';

export const TRAINING_SYNC_INTERVAL_MS = 5000;

/**
 * Check quietly while visible, and immediately after returning or reconnecting. The check is
 * told which it is: `resumed` is true when the app came back to the foreground or online, and
 * false for the regular timed check, which is the one that may pause after unanswered attempts.
 */
export function useTrainingDataSync(check: (resumed: boolean) => Promise<void>, enabled: boolean) {
  const latestCheck = useRef(check);
  latestCheck.current = check;

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let checking = false;
    async function sync(resumed: boolean) {
      if (stopped || checking || document.visibilityState === 'hidden' || !navigator.onLine) return;
      checking = true;
      try {
        await latestCheck.current(resumed);
      } catch {
        // Keep the current screen and retry on the next tick or reconnect.
      } finally {
        checking = false;
      }
    }
    const resume = () => void sync(true);
    const interval = window.setInterval(() => void sync(false), TRAINING_SYNC_INTERVAL_MS);
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [enabled]);
}
