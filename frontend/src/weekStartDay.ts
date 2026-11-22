import type { TrainingPreferences } from './types';

// No React or browser APIs: the web's preferences context and the native app (mobile/) both read
// the week's first day here. Keep this file free of packages and DOM access.

/** The preferred first day of the week as a day number: 0 Sunday, 1 Monday (the default), 6 Saturday. */
export function weekStartDayFromPreference(
  weekStart: TrainingPreferences['week_start'] | undefined,
) {
  return weekStart === 'sunday' ? 0 : weekStart === 'saturday' ? 6 : 1;
}
