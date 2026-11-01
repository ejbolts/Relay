export function completedWorkoutDurationMinutes(
  previousDurationMinutes: number,
  startedAt: number,
  endedAt: number,
  overrideMinutes: number | null,
  pausedMs = 0,
): number {
  if (overrideMinutes !== null) return overrideMinutes;
  const elapsedSeconds = Math.max(0, Math.floor((endedAt - startedAt - pausedMs) / 1000));
  return Math.max(1, previousDurationMinutes + Math.round(elapsedSeconds / 60));
}
