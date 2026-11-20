import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Holds a deletion back so it can be undone. Its toast's countdown ends it with `flush`; it also
 * goes through when another deletion starts, or when the app is hidden or closed, so leaving the
 * app never quietly brings the item back.
 */
export function useDeferredDelete<T>(commit: (item: T) => void) {
  const [pending, setPending] = useState<T | null>(null);
  const pendingRef = useRef<T | null>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const settle = useCallback((apply: boolean) => {
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
    },
    [flush],
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
