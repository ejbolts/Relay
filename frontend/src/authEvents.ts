/** Window event fired when the server rejects a request because the session is gone. */
export const AUTH_EXPIRED_EVENT = 'gym-logger-auth-expired';

/** Error code the API returns for any authenticated request without a valid session. */
export const NOT_AUTHENTICATED_CODE = 'not_authenticated';

export function emitAuthExpired(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

/** Subscribe to session expiry. Returns an unsubscribe function. */
export function subscribeAuthExpired(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(AUTH_EXPIRED_EVENT, listener);
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
}
