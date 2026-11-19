import { setKindOf } from './setFieldValues';
import type { WorkoutSetInput } from './types';

type KindFields = Pick<WorkoutSetInput, 'set_type' | 'warmup' | 'failed'>;

/** Warm-ups, drop sets and working sets (including attempted ones) each line up separately. */
function kindGroup(item: KindFields): string {
  const kind = setKindOf(item);
  return kind === 'failure' ? 'normal' : kind;
}

/**
 * The set from the exercise's last session that a row of today's workout stands for: the same
 * kind of set in the same position among them, such as the second working set.
 */
export function matchingLastSessionSet<T extends KindFields>(
  rows: readonly KindFields[],
  rowIndex: number,
  lastSession: readonly T[],
): T | undefined {
  const row = rows[rowIndex];
  if (!row) return undefined;
  const group = kindGroup(row);
  const position = rows.slice(0, rowIndex).filter((item) => kindGroup(item) === group).length;
  return lastSession.filter((item) => kindGroup(item) === group)[position];
}
