import { ApiError, serverOrigin } from '../../data/api';
import { forgetSessionTokenIf, sessionToken } from '../../data/session';
import { sessionEpoch } from '../../session/sessionEpoch';

/**
 * The session the work belongs to has ended on this phone: signed out (its token is already gone
 * while the sign-out finishes), refused by the server, or replaced by another sign-in. The work
 * waits for its own account to sign in again; it is never a refusal of the workout itself.
 */
export class SessionEnded extends Error {
  constructor() {
    super('Signed out on this phone. It is sent when this account signs in again.');
    this.name = 'SessionEnded';
  }
}

export interface SessionBound {
  /** Sends with this session's own token, never with none or another account's. */
  send<T>(request: (token: string) => Promise<T>): Promise<T>;
  /**
   * Reads with the saved session, as `apiGet` does, while it is still this one, and answers only
   * if it still is: a reply that arrives after a sign-out or another sign-in is dropped.
   */
  read<T>(request: () => Promise<T>): Promise<T>;
}

/**
 * Binds requests to the session signed in when this is called, for work that outlives a screen,
 * such as the finished-workout queue and the active-workout sync. The session is the sign-in's
 * number on this phone and the token it was first sent with, so a sign-out (which deletes the
 * token before the session ends) or a later sign-in never sends this session's work.
 */
export function sessionBound(): SessionBound {
  const epoch = sessionEpoch();
  let pinned: string | null = null;

  async function token() {
    if (sessionEpoch() !== epoch) throw new SessionEnded();
    const saved = await sessionToken(serverOrigin());
    if (!saved || sessionEpoch() !== epoch || (pinned !== null && saved !== pinned))
      throw new SessionEnded();
    pinned = saved;
    return saved;
  }

  async function refused(error: unknown, used: string): Promise<never> {
    if (error instanceof ApiError && error.status === 401) {
      // The server ended this session: forget its token only while it is still the saved one.
      await forgetSessionTokenIf(serverOrigin(), used);
      throw new SessionEnded();
    }
    throw error;
  }

  return {
    async send(request) {
      const used = await token();
      try {
        return await request(used);
      } catch (error) {
        return refused(error, used);
      }
    },
    async read(request) {
      const used = await token();
      let result;
      try {
        result = await request();
      } catch (error) {
        return refused(error, used);
      }
      if (sessionEpoch() !== epoch) throw new SessionEnded();
      return result;
    },
  };
}
