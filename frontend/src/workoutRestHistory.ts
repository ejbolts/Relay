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
  const ordinal = sets.slice(0, index).filter((set) => setKindOf(set) === kind).length;
  return history.flatMap((entry) => {
    const previous = entry.sets.filter((set) => setKindOf(set) === kind)[ordinal];
    return previous
      ? [{ workoutId: entry.workoutId, date: entry.workoutDate, seconds: previous.rest_seconds }]
      : [];
  });
}
