import type { Exercise, ExerciseKind, WorkoutSetInput } from './types';

// Partial and assisted reps: the reps of a set beyond its full ones, logged for exercises whose
// owner turns that on. A set's `reps` stay its full reps, so volume, records and rep targets
// never count them. Plain functions with no React or browser APIs: the web logger and the native
// app (mobile/) both use them.

export type ExtraRepField = 'partial_reps' | 'assisted_reps';

/** The kinds of extra rep, in the order they are entered and shown. */
export const EXTRA_REP_KINDS: readonly {
  field: ExtraRepField;
  /** The field's heading in a set, such as "Partial". */
  label: string;
  /** The word after a count, such as "4 partial". */
  word: string;
}[] = [
  { field: 'partial_reps', label: 'Partial', word: 'partial' },
  { field: 'assisted_reps', label: 'Assisted', word: 'assisted' },
];

/** The exercise's switch, where a menu can show it ticked. */
export const EXTRA_REPS_SETTING = 'Partial & assisted reps';

/** The same switch as an action, for menus that cannot show a tick. */
export function extraRepsAction(tracked: boolean): string {
  return tracked ? 'Stop tracking partial & assisted reps' : 'Track partial & assisted reps';
}

/** The confirmation after the switch changes. */
export function extraRepsNotice(tracked: boolean, exerciseName: string): string {
  return `Partial and assisted reps ${tracked ? 'on' : 'off'} for ${exerciseName}`;
}

type ExtraReps = Pick<WorkoutSetInput, ExtraRepField>;

/** Whether the logger offers partial and assisted reps on this exercise's sets. */
export function tracksExtraReps(
  exercise: Pick<Exercise, 'kind' | 'extra_reps_enabled'> | undefined,
): boolean {
  return exercise?.kind === 'strength' && exercise.extra_reps_enabled === true;
}

/** Whether a set records any partial or assisted reps. A count of 0 is none. */
export function hasExtraReps(item: ExtraReps): boolean {
  return EXTRA_REP_KINDS.some(({ field }) => (item[field] ?? 0) > 0);
}

/**
 * A set's partial and assisted reps as "+4 partial · +2 assisted", or null without any. Shown
 * beside the set rather than in its Reps column, which stays the full reps.
 */
export function extraRepsText(item: ExtraReps): string | null {
  const parts = EXTRA_REP_KINDS.filter(({ field }) => (item[field] ?? 0) > 0).map(
    ({ field, word }) => `+${item[field]} ${word}`,
  );
  return parts.length ? parts.join(' · ') : null;
}

/** The same, spoken: "4 partial reps, 2 assisted reps". */
export function extraRepsLabel(item: ExtraReps): string | null {
  const parts = EXTRA_REP_KINDS.filter(({ field }) => (item[field] ?? 0) > 0).map(
    ({ field, word }) => `${item[field]} ${word} ${item[field] === 1 ? 'rep' : 'reps'}`,
  );
  return parts.length ? parts.join(', ') : null;
}

/**
 * A set logged with only partial or assisted reps did no full reps, so it records 0 rather than
 * leaving them blank. Every app, including ones that predate these reps, then reads it as a
 * logged set.
 */
export function withFullRepsCounted<T extends WorkoutSetInput>(kind: ExerciseKind, item: T): T {
  return kind === 'strength' && item.completed && item.reps == null && hasExtraReps(item)
    ? { ...item, reps: 0 }
    : item;
}
