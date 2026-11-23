import { useCallback, useEffect, useRef } from 'react';
import { useUser } from '../../session/SessionProvider';

/**
 * Guards a request's result against a change of account. Call it before the request; the
 * returned check is true only while the same account is still signed in and the screen that sent
 * it is still open. Signing out unmounts every signed-in screen, so a response that arrives after
 * another account signs in is dropped instead of writing the previous account's data.
 */
export function useAccountGuard() {
  const user = useUser();
  const account = useRef(user.id);
  const mounted = useRef(true);
  useEffect(() => {
    account.current = user.id;
  }, [user.id]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(() => {
    const started = account.current;
    return () => mounted.current && account.current === started;
  }, []);
}
