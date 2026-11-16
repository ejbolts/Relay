/** What the live workout sheet reports about itself, for the tab bar's Start bubble. */
export interface LiveWorkoutSummary {
  name: string;
  loggedSets: number;
  previousDurationMinutes: number;
  durationOverrideMinutes: number | null;
  paused: boolean;
}

/** Total time shown for the live workout, including time from before it was resumed. */
export function liveWorkoutDurationSeconds(
  summary: Pick<LiveWorkoutSummary, 'previousDurationMinutes' | 'durationOverrideMinutes'> | null,
  elapsedSeconds: number,
): number {
  if (!summary) return elapsedSeconds;
  if (summary.durationOverrideMinutes !== null) return summary.durationOverrideMinutes * 60;
  return summary.previousDurationMinutes * 60 + elapsedSeconds;
}
