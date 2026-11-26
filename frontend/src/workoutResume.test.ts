import { describe, expect, it } from 'vitest';
import {
  canResumeWorkout,
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
  it('ends when the workout finished and starts its duration before, across midnight', () => {
    expect(liveWorkoutTimes(new Date(2026, 10, 19, 17, 0, 40).getTime(), 45)).toEqual({
      start: '16:15',
      end: '17:00',
    });
    expect(liveWorkoutTimes(new Date(2026, 10, 20, 0, 30).getTime(), 60)).toEqual({
      start: '23:30',
      end: '00:30',
    });
  });

  it('leaves out times that would start the evening before the day the workout is dated', () => {
    const finished = new Date(2026, 10, 27, 0, 20).getTime();
    // Dated the 27th, a 23:50 start would read as the night of the 27th: no times.
    expect(liveWorkoutTimes(finished, 30, '2026-11-27')).toBeNull();
    // Dated the 26th, the evening before is right.
    expect(liveWorkoutTimes(finished, 30, '2026-11-26')).toEqual({ start: '23:50', end: '00:20' });
    // A start on the day itself keeps its times.
    expect(liveWorkoutTimes(finished, 20, '2026-11-27')).toEqual({ start: '00:00', end: '00:20' });
  });

  it('leaves out a full day, which the times would read as zero', () => {
    expect(liveWorkoutTimes(new Date(2026, 10, 19, 9, 0).getTime(), 1440)).toBeNull();
  });
});

describe('which saved workouts offer Resume', () => {
  // Local times, so the checks hold in any time zone.
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);
  const saved = (date: string, savedAt: Date) => ({
    workout_date: date,
    created_at: savedAt.toISOString(),
    updated_at: savedAt.toISOString(),
  });

  it('offers it for any workout dated today', () => {
    expect(canResumeWorkout(saved('2026-11-19', at(19, 7)), at(19, 21).getTime())).toBe(true);
  });

  it('keeps a late session resumable for a few hours after midnight', () => {
    const lateSession = saved('2026-11-19', at(19, 23, 40));
    expect(canResumeWorkout(lateSession, at(20, 1, 30).getTime())).toBe(true);
    expect(canResumeWorkout(lateSession, at(20, 7).getTime())).toBe(false);
  });

  it('does not offer it for older workouts, even ones saved or imported just now', () => {
    const now = at(19, 21).getTime();
    expect(canResumeWorkout(saved('2026-11-18', at(18, 18)), now)).toBe(false);
    expect(canResumeWorkout(saved('2026-11-09', at(19, 20, 55)), now)).toBe(false);
  });

  it('counts the latest save, so a session resumed again late stays resumable', () => {
    const resumed = {
      workout_date: '2026-11-19',
      created_at: at(19, 18).toISOString(),
      updated_at: at(19, 23, 50).toISOString(),
    };
    expect(canResumeWorkout(resumed, at(20, 2).getTime())).toBe(true);
  });
});
