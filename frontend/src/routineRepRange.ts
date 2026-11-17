import type { RepRange, Routine } from './types';

/** Whether `routine` plans `exerciseId` on some day without a rep range yet. */
export function activeRoutineWithout(routine: Routine | null, exerciseId: string): boolean {
  return (
    routine?.days.some((day) =>
      day.movements.some((movement) => movement.exercise_id === exerciseId && !movement.rep_range),
    ) ?? false
  );
}

/** The routine with `range` on every plan of `exerciseId` that has none; other ranges are kept. */
export function withRepRange(routine: Routine, exerciseId: string, range: RepRange): Routine {
  return {
    ...routine,
    days: routine.days.map((day) => ({
      ...day,
      movements: day.movements.map((movement) =>
        movement.exercise_id === exerciseId && !movement.rep_range
          ? { ...movement, rep_range: range }
          : movement,
      ),
    })),
  };
}

/**
 * The preset to suggest for an exercise stuck at `reps`: the narrowest range that has room above
 * those reps, so the next sessions have reps to add before the weight goes up.
 */
export function suggestedRepRange(reps: number, presets: RepRange[]): RepRange {
  return (
    presets.find((range) => reps >= range.min && reps < range.max) ??
    presets.find((range) => reps < range.min) ??
    presets[presets.length - 1]
  );
}
