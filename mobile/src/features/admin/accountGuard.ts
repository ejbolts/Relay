import { useCallback, useEffect, useRef } from 'react';
import { sessionEpoch } from '../../session/sessionEpoch';

/** Checks for one request, taken when it starts. */
export interface AccountCheck {
  /**
   * The session that sent the request is still the signed-in one. Results bound to the account,
   * such as cache writes and a profile refresh, need only this: a confirmed change still lands
   * after an ordinary Back, but never after a sign-out or another account's sign-in.
   */
  sameSession: () => boolean;
  /** The same session, and the screen that sent it is still open: for local state and toasts. */
  open: () => boolean;
}

/**
 * Guards a request's results against a change of account. Call the returned function when a
 * request starts; it is based on SessionProvider's session number, not on the screen's lifetime.
 */
export function useAccountGuard() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback((): AccountCheck => {
    const started = sessionEpoch();
    const sameSession = () => sessionEpoch() === started;
    return { sameSession, open: () => sameSession() && mounted.current };
  }, []);
}
