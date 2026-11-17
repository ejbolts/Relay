import { useEffect, useRef } from 'react';

export const TRAINING_SYNC_INTERVAL_MS = 5000;

/** Check quietly while visible, and immediately after returning or reconnecting. */
export function useTrainingDataSync(check: () => Promise<void>, enabled: boolean) {
  const latestCheck = useRef(check);
  latestCheck.current = check;

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let checking = false;
    async function sync() {
      if (stopped || checking || document.visibilityState === 'hidden' || !navigator.onLine) return;
      checking = true;
      try {
        await latestCheck.current();
      } catch {
        // Keep the current screen and retry on the next tick or reconnect.
      } finally {
        checking = false;
      }
    }
    const interval = window.setInterval(() => void sync(), TRAINING_SYNC_INTERVAL_MS);
    window.addEventListener('focus', sync);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [enabled]);
}
