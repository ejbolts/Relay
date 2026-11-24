import { isYouTubeReturn } from '../features/videos/youtubeReturn';
import { captureFriendInvite } from '../session/friendInvite';
import { webLinkRoute } from '../session/webLinks';

/**
 * Every system link passes through here, the launch link included. Web links (from universal
 * links and App Links) open their app screen, and invites are remembered before protected routes
 * send a signed-out visitor to Sign in.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  // The YouTube sign-in browser's return belongs to the screen that opened it. If the app was
  // closed meanwhile, open Videos, where the connection shows.
  if (isYouTubeReturn(path)) return initial ? '/videos' : null;
  const link = webLinkRoute(path);
  const route = link?.route ?? path;
  captureFriendInvite(route, link?.friend ? (link.registrationCode ?? null) : undefined);
  return route;
}
