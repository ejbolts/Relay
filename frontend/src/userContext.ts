import { createContext, useContext } from 'react';
import type { User } from './types';

export interface UserSession {
  /** The signed-in account, or null when rendered outside the auth gate. */
  user: User | null;
  /** Replace the stored user after a profile edit. */
  updateUser: (user: User) => void;
  /** Ends the session, wipes this account's local data, and restarts at the sign-in screen. */
  signOut: () => Promise<void>;
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
  accountDeleted: noop,
});

export function useUserSession(): UserSession {
  return useContext(UserContext);
}

/** Video uploads stay available unless the server explicitly says the account cannot upload. */
export function canUploadVideos(user: User | null): boolean {
  return user === null || user.can_upload_videos !== false;
}
