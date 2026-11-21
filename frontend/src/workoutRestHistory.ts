import { setKindOf } from './setFieldValues';
import type { WorkoutSetInput } from './types';
import type { ExerciseHistoryEntry } from './exerciseHistory';

/** Match the nth set of its kind, so an extra warm-up cannot shift working-set history. */
export function previousSetRests(
  sets: WorkoutSetInput[],
  index: number,
  history: ExerciseHistoryEntry[],
) {
  const kind = setKindOf(sets[index]);
  const machine = sets[index].machine_photo_id;
  const ordinal = sets
    .slice(0, index)
    .filter(
      (set) => setKindOf(set) === kind && (!machine || set.machine_photo_id === machine),
    ).length;
  return history.flatMap((entry) => {
    const previous = entry.sets.filter((set) => setKindOf(set) === kind)[ordinal];
    return previous
      ? [{ workoutId: entry.workoutId, date: entry.workoutDate, seconds: previous.rest_seconds }]
      : [];
  });
}

/**
 * The rest to give a set that has none shown: its own hidden rest, else what this set had last
 * time, else the nearest rest in this exercise, else the user's default rest, if any.
 */
export function restToAdd(
  sets: WorkoutSetInput[],
  index: number,
  history: ExerciseHistoryEntry[],
  defaultRest: number | null = null,
): number | undefined {
  const own = sets[index].rest_seconds;
  if (own && own > 0) return own;
  const previous = previousSetRests(sets, index, history).find((rest) => (rest.seconds ?? 0) > 0);
  if (previous?.seconds) return previous.seconds;
  for (let distance = 1; distance < sets.length; distance += 1) {
    for (const other of [sets[index - distance], sets[index + distance]]) {
      if (other?.rest_seconds && other.rest_seconds > 0) return other.rest_seconds;
    }
  }
  return defaultRest ?? undefined;
}
