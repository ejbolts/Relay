/**
 * The app link Relay's server returns the YouTube sign-in browser to, with the result as
 * `?youtube=<result>` (the same words the web's `/?youtube=<result>` return uses).
 */
export const YOUTUBE_RETURN_PATH = 'youtube-return';

const RETURN = new RegExp(
  `^(?:relay-mobile:\\/\\/\\/?|exps?:\\/\\/[^/]+\\/--\\/|\\/)${YOUTUBE_RETURN_PATH}(?:[?#]|$)`,
);

/** Whether a system link is the sign-in browser's return rather than a screen to open. */
export function isYouTubeReturn(url: string): boolean {
  return RETURN.test(url);
}

/** The result word a return link carries; an unreadable return counts as a failure. */
export function youtubeReturnResult(url: string): string {
  const query = /\?([^#]*)/.exec(url)?.[1];
  const result = query ? new URLSearchParams(query).get('youtube') : null;
  return result && /^[a-z_]{1,40}$/.test(result) ? result : 'failed';
}
