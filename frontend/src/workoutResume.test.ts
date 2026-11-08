import { describe, expect, it } from 'vitest';
import {
  cardioAdjustedEndTime,
  completedCardioDurationSeconds,
  completedWorkoutDurationMinutes,
  workoutDurationSeconds,
} from './workoutResume';
import { createWorkoutSet } from './workoutSets';

describe('logged cardio workout time', () => {
  it('sums completed cardio across exercises without counting suggestions or strength fields', () => {
    const cardio = { ...createWorkoutSet('cardio'), completed: true, duration_seconds: 1200 };
    expect(
      completedCardioDurationSeconds([
        { exercise: { kind: 'cardio' }, sets: [cardio, { ...cardio, completed: false }] },
        { exercise: { kind: 'cardio' }, sets: [{ ...cardio, duration_seconds: 600 }] },
        { exercise: { kind: 'strength' }, sets: [cardio] },
        { exercise: { kind: 'cardio' }, sets: [{ ...cardio, duration_seconds: null }] },
      ]),
    ).toBe(1800);
  });

  it.each([
    [600, 1800, 0, null, 1800],
    [2400, 1800, 0, null, 2400],
    [600, 1800, 45, null, 3300],
    [600, 1800, 45, 20, 1800],
    [600, 1800, 45, 60, 3600],
  ])(
    'uses the greater of cardio and timer/corrected time',
    (elapsed, cardio, previous, override, total) => {
      expect(workoutDurationSeconds(elapsed, cardio!, previous!, override)).toBe(total);
    },
  );

  it('rounds the saved cardio minimum up to a whole minute', () => {
    expect(completedWorkoutDurationMinutes(0, 0, 600_000, null, 0, 1801)).toBe(31);
  });

  it('counts resumed and paused time once, while enforcing the cardio minimum on overrides', () => {
    expect(completedWorkoutDurationMinutes(45, 0, 600_000, null, 0, 3000)).toBe(55);
    expect(completedWorkoutDurationMinutes(0, 0, 3600_000, null, 2400_000, 1800)).toBe(30);
    expect(completedWorkoutDurationMinutes(0, 0, 600_000, 20, 0, 1800)).toBe(30);
  });

  it('extends a shorter saved time range through midnight and preserves longer or incomplete ranges', () => {
    expect(cardioAdjustedEndTime('23:45', '23:55', 1800)).toBe('00:15');
    expect(cardioAdjustedEndTime('09:00', '10:00', 1800)).toBe('10:00');
    expect(cardioAdjustedEndTime('', '10:00', 1800)).toBe('10:00');
  });
});

describe('resuming a finished workout', () => {
  it('adds only the time since resuming to the saved duration', () => {
    const resumedAt = Date.UTC(2026, 8, 28, 18, 0);
    expect(completedWorkoutDurationMinutes(45, resumedAt, resumedAt + 10 * 60_000, null)).toBe(55);
  });

  it('leaves paused time out of the saved duration', () => {
    const startedAt = Date.UTC(2026, 8, 28, 18, 0);
    expect(
      completedWorkoutDurationMinutes(0, startedAt, startedAt + 40 * 60_000, null, 15 * 60_000),
    ).toBe(25);
  });

  it('treats a corrected duration as the total, not another segment', () => {
    const resumedAt = Date.UTC(2026, 8, 28, 18, 0);
    expect(completedWorkoutDurationMinutes(45, resumedAt, resumedAt + 10 * 60_000, 50)).toBe(50);
  });
});
