import { useEffect, useState } from 'react';

export async function cancelRestTimerPushSchedule(
  cancel: () => Promise<void>,
  pendingSchedules: Iterable<Promise<void>>,
): Promise<void> {
  const firstCancellation = cancel().catch(() => undefined);
  await Promise.allSettled([firstCancellation, ...pendingSchedules]);
  await cancel().catch(() => undefined);
}

/** Whole seconds until `endsAt`, never below zero. */
export function restSecondsLeft(endsAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** The rest left before `endsAt`, ticking down to zero; zero without a timer. */
export function useRestCountdown(endsAt: number | null): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) window.clearInterval(timer);
    };
    const timer = window.setInterval(tick, 500);
    tick();
    return () => window.clearInterval(timer);
  }, [endsAt]);
  return endsAt === null ? 0 : restSecondsLeft(endsAt, now);
}
