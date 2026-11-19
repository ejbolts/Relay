import { describe, expect, it } from 'vitest';
import {
  liveWorkoutTimes,
  cardioAdjustedEndTime,
  completedCardioDurationSeconds,
  completedWorkoutDurationMinutes,
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

  it.each<[number, number, number, number | null, number]>([
    [600, 1800, 0, null, 30],
    [2400, 1800, 0, null, 40],
    [600, 1800, 45, null, 55],
    [600, 1800, 45, 20, 30],
    [600, 1800, 45, 60, 60],
  ])(
    'finishes with the greater of cardio and timer/corrected time',
    (elapsed, cardio, previous, override, total) => {
      expect(
        completedWorkoutDurationMinutes(previous, 0, elapsed * 1000, override, 0, cardio),
      ).toBe(total);
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

describe('live workout clock times', () => {
  it('records the real start and the end its saved duration reaches, across midnight', () => {
    expect(liveWorkoutTimes(new Date(2026, 10, 19, 16, 15, 40).getTime(), 45)).toEqual({
      start: '16:15',
      end: '17:00',
    });
    expect(liveWorkoutTimes(new Date(2026, 10, 19, 23, 30).getTime(), 60)).toEqual({
      start: '23:30',
      end: '00:30',
    });
  });

  it('leaves out a full day, which the times would read as zero', () => {
    expect(liveWorkoutTimes(new Date(2026, 10, 19, 9, 0).getTime(), 1440)).toBeNull();
  });
});
