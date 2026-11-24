import { isYouTubeReturn } from '../features/videos/youtubeReturn';
import { captureFriendInvite } from '../session/friendInvite';
import { webLinkRoute } from '../session/webLinks';

/**
 * Every system link passes through here, the launch link included. Web links (from universal
 * links and App Links) open their app screen, and invites are remembered before protected routes
 * send a signed-out visitor to Sign in.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  // The YouTube sign-in browser's return belongs to the attempt that opened it. If Relay was
  // closed meanwhile, that attempt and its secret are gone: say so, so the person tries again.
  if (isYouTubeReturn(path)) return initial ? '/settings/youtube?attempt=lost' : null;
  const link = webLinkRoute(path);
  const route = link?.route ?? path;
  // Any invite link, with or without a code, replaces an earlier link's code.
  captureFriendInvite(route, link?.registrationCode ?? null);
  return route;
}
