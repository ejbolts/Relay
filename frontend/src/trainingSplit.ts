import type { TrainingSplit } from './types';
import { addDays, parseLocalDate } from './trainingSummary';

export const MAX_SPLIT_DAYS = 28;

/** Preserve A/B suffixes in narrow cells while the full name stays accessible. */
export function splitPreviewLabel(name: string): string {
  return name.replace(/^(upper|lower|full) body\b/i, '$1');
}
export const SPLIT_TEMPLATES = [
  { id: 'upper-lower', name: 'Upper / Lower', types: ['upper', 'lower', null] },
  { id: 'ppl', name: 'Push / Pull / Legs', types: ['push', 'pull', 'lower', null] },
  { id: 'fbeod', name: 'FBEOD', types: ['full_body', null] },
  { id: 'cardio', name: 'Cardio', types: ['cardio', null] },
] as const;

export function splitFromTemplate(id: string, startDate: string): TrainingSplit {
  const preset = SPLIT_TEMPLATES.find((item) => item.id === id);
  return {
    name: preset?.name ?? 'My split',
    enabled: true,
    start_date: startDate,
    steps: (preset?.types ?? ['upper', null]).map((workout_type_id) => ({ workout_type_id })),
  };
}

/**
 * A By date split's step on a date, counted from its latest skip or catch-up once that has
 * happened. UTC day numbers avoid daylight-saving changes in the length of a local day.
 */
export function splitStepOnDate(split: TrainingSplit, date: string): number | null {
  const dayNumber = (value: string) => {
    const parsed = parseLocalDate(value);
    return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) / 86_400_000;
  };
  const size = split.steps.length;
  const shift = followsWorkouts(split) ? null : split.shift;
  if (size && shift && date >= shift.from_date)
    return (shift.step + dayNumber(date) - dayNumber(shift.from_date)) % size;
  const elapsed = dayNumber(date) - dayNumber(split.start_date);
  return elapsed < 0 || !size ? null : elapsed % size;
}

/** The split day Up next stands on: a followed split's next step, else today's dated step. */
export function currentSplitStep(split: TrainingSplit, today: string): number | null {
  if (!split.steps.length) return null;
  return followsWorkouts(split) ? (split.next_step ?? null) : splitStepOnDate(split, today);
}

/** The next workout day after `step`, passing over rest days; `step` itself if it is the only one. */
export function nextTrainingStep(split: TrainingSplit, step: number): number {
  const size = split.steps.length;
  for (let ahead = 1; ahead <= size; ahead += 1) {
    const next = (step + ahead) % size;
    if (split.steps[next].workout_type_id !== null) return next;
  }
  return step;
}

/** Splits follow logged workouts unless explicitly pinned to the calendar. */
export function followsWorkouts(split: TrainingSplit): boolean {
  return split.progression !== 'calendar';
}

/** A day of the split ahead: its step (the routine day it follows) and workout type, if any. */
export interface SplitPreviewDay {
  date: string;
  step?: number;
  typeId: string | null | undefined;
}

export function splitPreview(split: TrainingSplit, from: string, count = 7): SplitPreviewDay[] {
  if (followsWorkouts(split)) return followedSplitPreview(split, from, count);
  return Array.from({ length: count }, (_, offset) => {
    const date = addDays(from, offset);
    const index = splitStepOnDate(split, date);
    return index === null
      ? { date, typeId: undefined }
      : { date, step: index, typeId: split.steps[index].workout_type_id };
  });
}

/**
 * Days ahead of a workout-following split if each one is done as planned. A saved rest skips
 * the first planned rest it reaches; earlier days have no plan because they follow history.
 */
function followedSplitPreview(
  split: TrainingSplit,
  from: string,
  count: number,
): SplitPreviewDay[] {
  const size = split.steps.length;
  const first = split.next_date ?? split.start_date;
  let index = split.next_step ?? 0;
  let saved = split.rest_saved === true;
  let started = false;
  return Array.from({ length: count }, (_, offset) => {
    const date = addDays(from, offset);
    if (!size || date < first) return { date, typeId: undefined };
    if (started) index = (index + 1) % size;
    started = true;
    if (saved && split.steps[index].workout_type_id === null) {
      saved = false;
      index = (index + 1) % size;
    }
    return { date, step: index, typeId: split.steps[index].workout_type_id };
  });
}

/**
 * The workout type a split puts on calendar days: the past days it marks missed, then today and
 * the `daysAhead` after it as if each is done as planned. Rest days are left out.
 */
export function splitCalendarDays(
  split: TrainingSplit | null | undefined,
  today: string,
  daysAhead: number,
): Map<string, string> {
  const days = new Map<string, string>();
  if (!split?.enabled) return days;
  for (const day of split.missed_days ?? []) {
    if (day.workout_date < today) days.set(day.workout_date, day.workout_type_id);
  }
  for (const { date, typeId } of splitPreview(split, today, daysAhead + 1)) {
    if (typeId) days.set(date, typeId);
  }
  return days;
}
