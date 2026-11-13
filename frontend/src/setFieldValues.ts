import type { WorkoutSetInput } from './types';

export const RPE_OPTIONS = [5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

export type SetKind = 'normal' | 'warmup' | 'drop' | 'failure';

export type SetKindFields = Pick<WorkoutSetInput, 'set_type' | 'warmup' | 'failed'>;

/** The set types offered in the set-number menu, with the letter shown in place of a number. */
export const SET_KINDS: Array<{ kind: SetKind; label: string; letter: string | null }> = [
  { kind: 'normal', label: 'Working set', letter: null },
  { kind: 'warmup', label: 'Warm-up', letter: 'W' },
  { kind: 'drop', label: 'Drop set', letter: 'D' },
  { kind: 'failure', label: 'Attempted', letter: 'A' },
];

export function setKindOf(item: SetKindFields): SetKind {
  if (item.set_type === 'warmup' || item.warmup) return 'warmup';
  if (item.set_type === 'drop') return 'drop';
  if (item.failed) return 'failure';
  return 'normal';
}

/** The fields to store when the lifter picks a set type. Attempted uses the existing failed flag. */
export function setKindUpdate(kind: SetKind): Required<SetKindFields> {
  return {
    set_type: kind === 'warmup' || kind === 'drop' ? kind : 'normal',
    warmup: kind === 'warmup',
    failed: kind === 'failure',
  };
}

/** Working sets are numbered 1…n; warm-ups show W, drop sets D and attempted sets A. */
export function setNumberLabels(sets: SetKindFields[]): string[] {
  let working = 0;
  return sets.map((item) => {
    const letter = SET_KINDS.find((option) => option.kind === setKindOf(item))?.letter;
    if (letter) return letter;
    working += 1;
    return String(working);
  });
}
