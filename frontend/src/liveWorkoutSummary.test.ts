import { expect, it } from 'vitest';
import { liveWorkoutDurationSeconds } from './liveWorkoutSummary';

it('shows only the live time before the sheet reports a summary', () => {
  expect(liveWorkoutDurationSeconds(null, 95)).toBe(95);
});

it('adds the time from before a workout was resumed', () => {
  expect(
    liveWorkoutDurationSeconds({ previousDurationMinutes: 10, durationOverrideMinutes: null }, 30),
  ).toBe(630);
});

it('shows an edited duration instead of the running time', () => {
  expect(
    liveWorkoutDurationSeconds({ previousDurationMinutes: 10, durationOverrideMinutes: 45 }, 30),
  ).toBe(2700);
});
