import { captureFriendInvite } from '../session/friendInvite';

/** Remember system invites before protected routes send a signed-out visitor to Sign in. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  captureFriendInvite(path);
  return path;
}
