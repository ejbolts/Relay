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

/**
 * Planned rows with last time's reps wherever their weight matches last time's matching set, so
 * an untouched row shows what was actually lifted rather than the plan's placeholder reps.
 * Warm-ups and rows at a new weight keep the plan's reps.
 */
export function withLastSessionReps<
  T extends KindFields & Pick<WorkoutSetInput, 'weight_kg' | 'reps'>,
>(
  rows: readonly T[],
  lastSession: readonly (KindFields & Pick<WorkoutSetInput, 'weight_kg' | 'reps'>)[],
): T[] {
  return rows.map((row, index) => {
    if (kindGroup(row) === 'warmup') return row;
    const last = matchingLastSessionSet(rows, index, lastSession);
    if (!last || last.reps == null || (last.weight_kg ?? null) !== (row.weight_kg ?? null)) {
      return row;
    }
    return { ...row, reps: last.reps };
  });
}

/**
 * Planned rows with the blanks a plan leaves (weight, reps, rest) filled from last time's
 * matching set, so a planned day suggests what was lifted, as an exercise added by hand does.
 * Rows beyond last time's count of that kind repeat its last one. Values the plan sets are kept;
 * a rest still blank after that gets `defaultRest`.
 */
export function withLastSessionValues<
  T extends KindFields & Pick<WorkoutSetInput, 'weight_kg' | 'reps' | 'rest_seconds'>,
>(
  rows: readonly T[],
  lastSession: readonly (KindFields &
    Pick<WorkoutSetInput, 'weight_kg' | 'reps' | 'rest_seconds'>)[],
  defaultRest: number | null,
): T[] {
  return rows.map((row, index) => {
    const last =
      matchingLastSessionSet(rows, index, lastSession) ??
      lastSession.filter((item) => kindGroup(item) === kindGroup(row)).at(-1);
    return {
      ...row,
      weight_kg: row.weight_kg ?? last?.weight_kg ?? null,
      reps: row.reps ?? last?.reps ?? null,
      rest_seconds: row.rest_seconds ?? last?.rest_seconds ?? defaultRest,
    };
  });
}
