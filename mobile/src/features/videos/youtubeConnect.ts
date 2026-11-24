import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { YouTubeConnection } from '../../../../frontend/src/types';
import { apiSend } from '../../data/api';
import { YOUTUBE_RETURN_PATH, readYouTubeReturn } from './youtubeReturn';

/**
 * How connecting YouTube ended:
 * - `result`: the server's result word (`connected`, `cancelled`, `expired`…), shown as the web
 *   shows its `?youtube=` return, with the connection when the server confirmed it;
 * - `closed`: the person closed the sign-in browser before Google returned;
 * - `stale`: the account changed before the browser opened, so nothing was opened;
 * - `web`: this server predates the app's sign-in, so connecting continues on the web.
 */
export type YouTubeConnectOutcome =
  | { kind: 'result'; result: string; connection?: YouTubeConnection }
  | { kind: 'closed' }
  | { kind: 'stale' }
  | { kind: 'web' };

interface ConnectStart {
  url: string;
  flow?: string;
  state?: string;
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Connects YouTube in a sign-in browser over the app (an auth session). The app keeps a secret
 * for this attempt and sends only its hash; Google's answer comes back as a one-time code that
 * only this app, with the secret and its sign-in, can turn into a saved channel.
 * `stillCurrent` is checked right before the browser opens, so a late start for an account that
 * has since signed out never opens one.
 */
export async function connectYouTubeInApp(
  stillCurrent: () => boolean,
): Promise<YouTubeConnectOutcome> {
  // `relay-mobile://youtube-return` in a build; Expo Go's own link to this project in development.
  const returnUrl = Linking.createURL(YOUTUBE_RETURN_PATH);
  const verifier = hex(Crypto.getRandomBytes(32));
  const challenge = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  const start = await apiSend<ConnectStart>('/api/youtube/connect', 'POST', {
    return_url: returnUrl,
    app_challenge: challenge,
  });
  // An older server ignores the return link and answers with Google's address only. That flow
  // needs a browser sign-in, so it can only finish on the web.
  if (start.flow !== 'app' || !start.state) return { kind: 'web' };
  if (!stillCurrent()) return { kind: 'stale' };
  const session = await WebBrowser.openAuthSessionAsync(start.url, returnUrl);
  if (session.type !== 'success') return { kind: 'closed' };
  const returned = readYouTubeReturn(session.url, returnUrl);
  if (!returned) return { kind: 'result', result: 'failed' };
  if (returned.result !== 'finish')
    // A link can only report a failure; success is the server's answer below.
    return { kind: 'result', result: returned.result === 'connected' ? 'failed' : returned.result };
  if (!stillCurrent()) return { kind: 'stale' };
  // Only the server's answer counts as connected.
  const finished = await apiSend<{ result: string; connection: YouTubeConnection }>(
    '/api/youtube/finish',
    'POST',
    { state: start.state, code: returned.code, verifier },
  );
  return { kind: 'result', result: finished.result, connection: finished.connection };
}
