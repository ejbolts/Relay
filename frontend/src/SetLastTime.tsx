import { lastTimeLabel } from './lastTimeLabel';
import { useWeightUnit } from './trainingPreferencesContext';
import type { TrackedSet, WorkoutSetInput } from './types';

/** A quiet "last 100×7" under a row's weight when today's values differ from last time's. */
export function SetLastTime({
  rows,
  index,
  sessions,
}: {
  rows: readonly WorkoutSetInput[];
  index: number;
  sessions: readonly { sets: readonly TrackedSet[] }[];
}) {
  const label = lastTimeLabel(rows, index, sessions, useWeightUnit());
  return label ? <small className="set-last-time num">last {label}</small> : null;
}
