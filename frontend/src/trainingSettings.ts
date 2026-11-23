// The choices and rules behind Settings > Training, shared by the web and the native app
// (mobile/). Keep this file free of packages and browser APIs: the app bundles it as it is.
import type { TrainingPreferences } from './types';

export const WEIGHT_UNIT_CHOICES: {
  value: TrainingPreferences['preferred_weight_unit'];
  label: string;
}[] = [
  { value: 'kg', label: 'Kilograms' },
  { value: 'lb', label: 'Pounds' },
];

export const WEEK_START_CHOICES: { value: TrainingPreferences['week_start']; label: string }[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'sunday', label: 'Sunday' },
  { value: 'saturday', label: 'Saturday' },
];

/** How long a pause in typing a weekly goal waits before saving; leaving the field saves at once. */
export const GOAL_SAVE_DELAY_MS = 800;

export const WEEKLY_GOAL_ERROR = 'Enter weekly muscle set goals between 1 and 1,000 whole sets.';

export const validWeeklySetGoal = (goal: number) =>
  Number.isInteger(goal) && goal >= 1 && goal <= 1000;

export const validWeeklySetGoals = (preferences: TrainingPreferences) =>
  validWeeklySetGoal(preferences.weekly_muscle_set_goal) &&
  Object.values(preferences.weekly_muscle_set_goals ?? {}).every(validWeeklySetGoal);

const DEFAULT_REST_CHOICES = [30, 60, 90, 120, 150, 180, 210, 240, 300];

/**
 * The default rest choices in seconds, shortest first, with an unusual saved value kept so the
 * control can show it. Null (no default rest) is offered separately as None.
 */
export function defaultRestChoices(seconds: number | null | undefined): number[] {
  const choices =
    seconds == null || DEFAULT_REST_CHOICES.includes(seconds)
      ? DEFAULT_REST_CHOICES
      : [...DEFAULT_REST_CHOICES, seconds];
  return [...choices].sort((left, right) => left - right);
}

/** Choices offered in Settings; the server accepts any 15-minute step from 30 to 720. */
export const WORKOUT_AUTO_SAVE_CHOICES = [60, 90, 120, 150, 180, 240, 300, 360] as const;
export const DEFAULT_WORKOUT_AUTO_SAVE_MINUTES = 180;

export function autoSaveChoiceLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!rest) return hours === 1 ? '1 hour' : `${hours} hours`;
  return hours ? `${hours} h ${rest} min` : `${rest} min`;
}

/** The auto-save choices, with an unusual saved time kept in order so the control can show it. */
export function autoSaveChoices(minutes: number | null): number[] {
  const choices: number[] = [...WORKOUT_AUTO_SAVE_CHOICES];
  if (minutes !== null && !choices.includes(minutes)) {
    choices.push(minutes);
    choices.sort((a, b) => a - b);
  }
  return choices;
}
