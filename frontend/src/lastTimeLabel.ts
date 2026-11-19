import { matchingLastSessionSet } from './lastSessionSet';
import type { TrackedSet, WorkoutSetInput } from './types';
import { formatWeightNumber, type WeightUnit } from './weightUnits';

const isWorking = (item: TrackedSet) =>
  item.completed && item.set_type !== 'warmup' && !item.warmup;

/**
 * What a row's matching set was last time, such as "100×7", so a plan's targets never hide what
 * was actually lifted. Only for an unticked row whose values differ from it; a session cut short
 * to warm-ups is passed over for the one before it.
 */
export function lastTimeLabel(
  rows: readonly WorkoutSetInput[],
  index: number,
  sessions: readonly { sets: readonly TrackedSet[] }[],
  unit: WeightUnit,
): string | null {
  const row = rows[index];
  if (!row || row.completed) return null;
  const lastSession = sessions.find((session) => session.sets.some(isWorking))?.sets ?? [];
  const last = matchingLastSessionSet(rows, index, lastSession);
  if (!last || last.reps == null) return null;
  if (last.weight_kg === row.weight_kg && last.reps === row.reps) return null;
  return last.weight_kg
    ? `${formatWeightNumber(last.weight_kg, unit)}×${last.reps}`
    : `${last.reps} reps`;
}
