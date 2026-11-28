import { useCallback, useEffect, useRef } from 'react';
import { getTrainState } from './trainStore';

/**
 * Runs work a moment later (after a sheet has closed, say), but never after the screen has gone
 * or the account has changed: unmounting cancels it, and it is skipped when another account (or
 * nobody) is signed in by then.
 */
export function useLater() {
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);
  return useCallback((run: () => void, ms: number) => {
    const account = getTrainState().userId;
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      if (account && getTrainState().userId === account) run();
    }, ms);
    timers.current.add(timer);
  }, []);
}
