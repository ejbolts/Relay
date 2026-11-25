import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { YouTubeConnection } from '../../../../frontend/src/types';
import { ApiError, request, serverOrigin } from '../../data/api';
import { forgetSessionTokenIf, sessionToken } from '../../data/session';
import { YOUTUBE_RETURN_PATH, readYouTubeReturn } from './youtubeReturn';

/**
 * How connecting YouTube ended:
 * - `result`: the server's result word (`connected`, `cancelled`, `permission`…), shown as the
 *   web shows its `?youtube=` return, with the connection the server confirmed;
 * - `interrupted`: the sign-in browser returned without a result the server could confirm;
 * - `closed`: the person closed the sign-in browser before Google returned;
 * - `stale`: the account changed meanwhile, so the attempt stopped;
 * - `web`: this server predates the app's sign-in, so connecting continues on the web.
 */
export type YouTubeConnectOutcome =
  | { kind: 'result'; result: string; connection?: YouTubeConnection }
  | { kind: 'interrupted' }
  | { kind: 'closed' }
  | { kind: 'stale' }
  | { kind: 'web' };

export const YOUTUBE_INTERRUPTED =
  "Connecting YouTube didn't finish. Your previous connection has not changed. Try again.";

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
 * for this attempt and sends only its hash; Google's answer, success or failure, comes back as a
 * one-time code that only this app, with the secret and the same sign-in, can redeem.
 *
 * Both requests use the sign-in that was current when the attempt began, and `stillCurrent` is
 * checked before each step, so a switch to another account never starts, opens or finishes an
 * attempt for it.
 */
export async function connectYouTubeInApp(
  stillCurrent: () => boolean,
): Promise<YouTubeConnectOutcome> {
  const origin = serverOrigin();
  const token = await sessionToken(origin);
  if (!token) throw new ApiError(401, 'Sign in to continue.');
  // Native randomness only: this throws rather than fall back to a weaker source.
  const verifier = hex(await Crypto.getRandomBytesAsync(32));
  const challenge = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  if (!stillCurrent()) return { kind: 'stale' };
  // `relay-mobile://youtube-return` in a build; Expo Go's own link to this project in development.
  const returnUrl = Linking.createURL(YOUTUBE_RETURN_PATH);
  const send = async <T>(path: string, body: unknown) => {
    try {
      return await request<T>(
        path,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        token,
      );
    } catch (error) {
      // The pinned sign-in ended on the server: forget it only if it is still the saved one.
      if (error instanceof ApiError && error.status === 401)
        await forgetSessionTokenIf(origin, token);
      throw error;
    }
  };
  const start = await send<ConnectStart>('/api/youtube/connect', {
    return_url: returnUrl,
    app_challenge: challenge,
  });
  // An older server ignores the return link and answers with Google's address only. That flow
  // needs a browser sign-in, so it can only finish on the web.
  if (start.flow !== 'app' || !start.state) return { kind: 'web' };
  if (!stillCurrent()) return { kind: 'stale' };
  const session = await WebBrowser.openAuthSessionAsync(start.url, returnUrl);
  if (session.type !== 'success') return { kind: 'closed' };
  // Only a code the server confirms counts; any other return link is unverified.
  const returned = readYouTubeReturn(session.url, returnUrl);
  if (returned?.result !== 'finish') return { kind: 'interrupted' };
  if (!stillCurrent()) return { kind: 'stale' };
  const finished = await send<{ result: string; connection: YouTubeConnection }>(
    '/api/youtube/finish',
    { state: start.state, code: returned.code, verifier },
  );
  // `expired` means the server couldn't confirm this code for this attempt: nothing is known
  // about what happened on Google, so it reads as interrupted, like an unconfirmed link.
  if (finished.result === 'expired') return { kind: 'interrupted' };
  return { kind: 'result', result: finished.result, connection: finished.connection };
}
