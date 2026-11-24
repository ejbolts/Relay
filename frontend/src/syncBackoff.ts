/**
 * How long automatic attempts wait after attempts in a row that the server did not answer. The
 * first retry comes with the next regular check, since one slow answer is ordinary on a small
 * server. After that the wait grows, so a server that is struggling is not asked for the same
 * work every few seconds, which is what keeps it struggling.
 */
export const SYNC_BACKOFF_MS = [0, 15_000, 30_000, 60_000] as const;

/** The wait before the next automatic attempt, after `unanswered` attempts in a row. */
export function syncRetryDelay(unanswered: number): number {
  if (unanswered <= 0) return 0;
  return SYNC_BACKOFF_MS[Math.min(unanswered, SYNC_BACKOFF_MS.length) - 1];
}
