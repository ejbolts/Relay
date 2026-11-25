// Package-free, so the native app can share it (see AGENTS.md "Web and mobile parity").

/** The share of the rest period still to go, for the rest pill's shrinking fill. */
export function restTimerProgress(seconds: number, totalSeconds: number): number {
  if (totalSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, seconds / totalSeconds));
}
