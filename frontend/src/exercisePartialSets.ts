// Package-free, so the native app can share it (see AGENTS.md "Web and mobile parity").
import { weekStartFor } from './trainingSummary';
import type { Exercise, TrainingPreferences } from './types';

export interface MuscleSetCredit {
  muscle_name: string;
  sets: number;
}

export function partialSetsEnabledForWeek(exercise: Exercise, weekStart: string): boolean {
  const latest = exercise.partial_set_weeks
    ?.filter((entry) => entry.week_start <= weekStart)
    .sort((left, right) => right.week_start.localeCompare(left.week_start))[0];
  return (
    latest?.enabled ?? exercise.partial_sets_default ?? exercise.partial_sets_enabled !== false
  );
}

/** Cardio exercises do not add strength sets to weekly muscle totals. */
export function isCardioExercise(exercise: Pick<Exercise, 'kind' | 'category'>): boolean {
  return exercise.kind === 'cardio' || exercise.category === 'cardio';
}

/** Splits an exercise's muscle set credits into direct (>= 1 set) and partial assistance (< 1). */
export function exerciseMuscleCredits(
  exercise: Pick<Exercise, 'default_muscle_set_credits' | 'muscle_set_credits'>,
): {
  credits: MuscleSetCredit[];
  direct: MuscleSetCredit[];
  partial: MuscleSetCredit[];
} {
  const credits = exercise.default_muscle_set_credits ?? exercise.muscle_set_credits ?? [];
  return {
    credits,
    direct: credits.filter((credit) => credit.sets >= 1),
    partial: credits.filter((credit) => credit.sets > 0 && credit.sets < 1),
  };
}

/** The JS weekday (0 = Sunday, 1 = Monday, 6 = Saturday) for the user's week-start preference. */
export function weekStartDayFromPreference(
  weekStart?: TrainingPreferences['week_start'] | null,
): 0 | 1 | 6 {
  return weekStart === 'sunday' ? 0 : weekStart === 'saturday' ? 6 : 1;
}

/** Snaps a chosen date to its training week start, ignoring empty or future dates. */
export function selectPartialSetWeek(
  date: string,
  today: string,
  weekStartDay: number,
): string | null {
  if (!date || date > today) return null;
  return weekStartFor(date, weekStartDay);
}

/** Formats a muscle credit's sets value, showing "Off" for disabled partial credits. */
export function formatMuscleCreditSets(sets: number, partialEnabled: boolean): string {
  if (sets < 1 && !partialEnabled) return 'Off';
  return `${sets} ${sets === 1 ? 'set' : 'sets'}`;
}
