import { ApiError, serverOrigin } from '../../data/api';
import { forgetSessionTokenIf, sessionToken } from '../../data/session';
import { sessionEpoch } from '../../session/sessionEpoch';

/**
 * The session the work belongs to has ended on this phone: signed out (its token is already gone
 * while the sign-out finishes), refused by the server, or replaced by another sign-in. The work
 * stays on the phone for this account's next sign-in here; it is never a refusal of the workout
 * itself. (Another account signing in on this phone first clears it: see
 * keepFinishedWorkoutsFor.)
 */
export class SessionEnded extends Error {
  constructor() {
    super('Signed out on this phone. Sign in again to send it.');
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
export function sessionBound({
  onEnded,
}: {
  /**
   * The server refused this session (signed out elsewhere, password changed): called so the app
   * checks its sign-in and shows the sign-in form, rather than looking signed in while the work
   * waits.
   */
  onEnded?: () => void;
} = {}): SessionBound {
  const epoch = sessionEpoch();
  let pinned: string | null = null;

  async function token() {
    if (sessionEpoch() !== epoch) throw new SessionEnded();
    // The saved sign-in can't be read (or is changing): this session can't send now either.
    const saved = await sessionToken(serverOrigin()).catch(() => null);
    if (!saved || sessionEpoch() !== epoch || (pinned !== null && saved !== pinned))
      throw new SessionEnded();
    pinned = saved;
    return saved;
  }

  /** A 401 ends this session here; `forget` is false where the request already forgot it. */
  async function refused(error: unknown, used: string, forget: boolean): Promise<never> {
    if (error instanceof ApiError && error.status === 401) {
      // Forget its token only while it is still the saved one. A keychain that can't be written
      // still ends the session here.
      if (forget) await forgetSessionTokenIf(serverOrigin(), used).catch(() => undefined);
      onEnded?.();
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
        return refused(error, used, true);
      }
    },
    async read(request) {
      const used = await token();
      let result;
      try {
        result = await request();
      } catch (error) {
        // apiGet sends the saved sign-in and forgets it itself on a 401.
        return refused(error, used, false);
      }
      if (sessionEpoch() !== epoch) throw new SessionEnded();
      return result;
    },
  };
}
