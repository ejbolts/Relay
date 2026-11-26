/**
 * Whether a saved workout offers Share straight away. On by default, and kept for each account on
 * this device, like other local notification and display choices.
 */
export const workoutShareReminderKey = (userId: string | null) =>
  `relay-workout-share-reminder:${userId ?? 'device'}`;

export const parseWorkoutShareReminder = (stored: string | null) => stored !== 'off';

export const storedWorkoutShareReminder = (enabled: boolean) => (enabled ? 'on' : 'off');
