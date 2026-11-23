import { createContext, useContext } from 'react';
import type { User } from './types';

export interface UserSession {
  /** The signed-in account, or null when rendered outside the auth gate. */
  user: User | null;
  /** Replace the stored user after a profile edit. */
  updateUser: (user: User) => void;
  /** Ends this device's session, wipes this account's local data, and restarts at sign-in. */
  signOut: () => Promise<void>;
  /** Like `signOut`, but also ends the account's sessions on every other device. */
  signOutEverywhere?: () => Promise<void>;
  /** Called once the server has deleted the account. */
  accountDeleted: () => Promise<void>;
  /** True while the sign-in screen is still animating away above the app; prompts wait. */
  signingIn?: boolean;
}

const noop = async () => undefined;

export const UserContext = createContext<UserSession>({
  user: null,
  updateUser: () => undefined,
  signOut: noop,
  signOutEverywhere: noop,
  accountDeleted: noop,
});

export function useUserSession(): UserSession {
  return useContext(UserContext);
}

// The rule lives in a pure module the native app shares; re-exported for the web's callers.
export { canUploadVideos } from './videoAccess';
