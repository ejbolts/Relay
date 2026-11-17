import type { Exercise } from './types';

export function partialSetsEnabledForWeek(exercise: Exercise, weekStart: string): boolean {
  const latest = exercise.partial_set_weeks
    ?.filter((entry) => entry.week_start <= weekStart)
    .sort((left, right) => right.week_start.localeCompare(left.week_start))[0];
  return (
    latest?.enabled ?? exercise.partial_sets_default ?? exercise.partial_sets_enabled !== false
  );
}
