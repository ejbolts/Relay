/**
 * The app link Relay's server returns the YouTube sign-in browser to. Its `?youtube=<result>` is
 * either `finish` with a one-time `code` the app must confirm with the server, or one of the
 * web's failure words (`cancelled`, `expired`, `permission`…).
 */
export const YOUTUBE_RETURN_PATH = 'youtube-return';

const RETURN = new RegExp(
  `^(?:relay-mobile:\\/\\/\\/?|exps?:\\/\\/[^/]+\\/--\\/|\\/)${YOUTUBE_RETURN_PATH}(?:[?#]|$)`,
);

/** Whether a system link is the sign-in browser's return rather than a screen to open. */
export function isYouTubeReturn(url: string): boolean {
  return RETURN.test(url);
}

export type YouTubeReturn = { result: 'finish'; code: string } | { result: string; code?: never };

/**
 * Reads the sign-in browser's return, only when it is exactly the link this attempt asked for.
 * Anything else is null, so an unrelated link never counts as a result.
 */
export function readYouTubeReturn(url: string, returnUrl: string): YouTubeReturn | null {
  if (!url.startsWith(`${returnUrl}?`) || url.includes('#')) return null;
  const query = new URLSearchParams(url.slice(returnUrl.length + 1));
  const result = query.get('youtube');
  if (!result || !/^[a-z_]{1,40}$/.test(result)) return null;
  if (result !== 'finish') return { result };
  const code = query.get('code');
  return code && /^[A-Za-z0-9_-]{20,200}$/.test(code) ? { result, code } : null;
}
