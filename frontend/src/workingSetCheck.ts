import { setKindOf, type SetKindFields } from './setFieldValues';

type CheckedSet = SetKindFields & { completed: boolean; weight_kg: number | null };

const isWarmup = (item: SetKindFields) => setKindOf(item) === 'warmup';

/** At least one set was logged and every logged set is a warm-up. */
export function loggedOnlyWarmups(sets: CheckedSet[]): boolean {
  const logged = sets.filter((item) => item.completed);
  return logged.length > 0 && logged.every(isWarmup);
}
