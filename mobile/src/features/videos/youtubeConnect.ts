import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { apiSend } from '../../data/api';
import { YOUTUBE_RETURN_PATH, youtubeReturnResult } from './youtubeReturn';

/**
 * How connecting YouTube ended:
 * - `result`: the server's result word (`connected`, `cancelled`, `expired`…), shown as the web
 *   shows its `?youtube=` return;
 * - `closed`: the person closed the sign-in browser before Google returned;
 * - `web`: this server predates the app's sign-in, so connecting continues on the web.
 */
export type YouTubeConnectOutcome =
  { kind: 'result'; result: string } | { kind: 'closed' } | { kind: 'web' };

/** The server's start link for the app's sign-in browser, which older servers don't send. */
const APP_START = /\/api\/youtube\/app-start\?/;

/**
 * Connects YouTube in a sign-in browser over the app (an auth session), so Google never needs the
 * app's sign-in: the server binds the flow to that browser and returns to the app with a result.
 */
export async function connectYouTubeInApp(): Promise<YouTubeConnectOutcome> {
  // `relay-mobile://youtube-return` in a build; Expo Go's own link to this project in development.
  const returnUrl = Linking.createURL(YOUTUBE_RETURN_PATH);
  const { url } = await apiSend<{ url: string }>('/api/youtube/connect', 'POST', {
    return_url: returnUrl,
  });
  // An older server ignores the return link and answers with Google's address. That flow needs a
  // browser sign-in, so it can only finish on the web.
  if (!APP_START.test(url)) return { kind: 'web' };
  const session = await WebBrowser.openAuthSessionAsync(url, returnUrl);
  if (session.type === 'success')
    return { kind: 'result', result: youtubeReturnResult(session.url) };
  return { kind: 'closed' };
}
