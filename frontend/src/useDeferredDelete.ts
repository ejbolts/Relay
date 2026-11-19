import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Holds a deletion back for a few seconds so it can be undone. It goes through when the time
 * runs out, when another deletion starts, or when the app is hidden or closed, so leaving the
 * app never quietly brings the item back.
 */
export function useDeferredDelete<T>(commit: (item: T) => void, delayMs: number) {
  const [pending, setPending] = useState<T | null>(null);
  const pendingRef = useRef<T | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const settle = useCallback((apply: boolean) => {
    window.clearTimeout(timerRef.current);
    const item = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (apply && item !== null) commitRef.current(item);
  }, []);
  const flush = useCallback(() => settle(true), [settle]);
  const undo = useCallback(() => settle(false), [settle]);

  const request = useCallback(
    (item: T) => {
      flush();
      pendingRef.current = item;
      setPending(item);
      timerRef.current = window.setTimeout(flush, delayMs);
    },
    [delayMs, flush],
  );

  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  return { pending, request, undo, flush };
}
