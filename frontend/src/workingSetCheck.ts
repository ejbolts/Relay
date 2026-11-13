import { setKindOf, type SetKindFields } from './setFieldValues';

type CheckedSet = SetKindFields & { completed: boolean; weight_kg: number | null };

/** Sets this close to the heaviest one are treated as the likely working sets. */
const WORKING_WEIGHT_SHARE = 0.8;

const isWarmup = (item: SetKindFields) => setKindOf(item) === 'warmup';

/** Every set is still a warm-up after at least two have been logged. */
export function needsWorkingSetNudge(sets: CheckedSet[]): boolean {
  return sets.filter((item) => item.completed).length >= 2 && sets.every(isWarmup);
}

/** At least one set was logged and every logged set is a warm-up. */
export function loggedOnlyWarmups(sets: CheckedSet[]): boolean {
  const logged = sets.filter((item) => item.completed);
  return logged.length > 0 && logged.every(isWarmup);
}

/**
 * Indexes of the sets most likely meant as working sets: those near the top weight,
 * skipping the opening ramp set. Unweighted sets suggest everything after the first.
 */
export function suggestedWorkingSetIndexes(sets: Array<Pick<CheckedSet, 'weight_kg'>>): number[] {
  if (sets.length <= 1) return sets.map((_, index) => index);
  const heaviest = Math.max(...sets.map((item) => item.weight_kg ?? 0));
  return sets
    .map((item, index) => ({ index, weight: item.weight_kg ?? 0 }))
    .filter(
      ({ index, weight }) =>
        index > 0 && (heaviest <= 0 || weight >= heaviest * WORKING_WEIGHT_SHARE),
    )
    .map(({ index }) => index);
}

/** "set 4", "sets 5–7" or "3 sets", numbered by position. */
export function setPositionsLabel(indexes: number[]): string {
  if (indexes.length === 1) return `set ${indexes[0] + 1}`;
  const contiguous = indexes.every((value, i) => i === 0 || value === indexes[i - 1] + 1);
  return contiguous
    ? `sets ${indexes[0] + 1}–${indexes[indexes.length - 1] + 1}`
    : `${indexes.length} sets`;
}
