import { describe, expect, it } from 'vitest';
import {
  extendInactiveWorkoutFinishAt,
  inactiveWorkoutEndAt,
  inactiveWorkoutFinishAt,
  inactiveWorkoutTimes,
  MAX_INACTIVE_WORKOUT_MS,
  RECENT_WORKOUT_ACTIVITY_MS,
  setInactiveWorkoutLimitMinutes,
  shouldAutoFinishWorkout,
} from './activeWorkoutTimeout';

describe('inactive workout timeout', () => {
  const startedAt = Date.UTC(2026, 8, 19, 9);

  it('ends a workout left running at its last activity, within the start and the cutoff', () => {
    const finishAt = startedAt + MAX_INACTIVE_WORKOUT_MS;
    expect(inactiveWorkoutEndAt(startedAt, startedAt + 30 * 60_000, finishAt)).toBe(
      startedAt + 30 * 60_000,
    );
    expect(inactiveWorkoutEndAt(startedAt, startedAt - 1, finishAt)).toBe(startedAt);
    expect(inactiveWorkoutEndAt(startedAt, finishAt + 1, finishAt)).toBe(finishAt);
  });

  it('finishes an inactive workout at three hours', () => {
    expect(shouldAutoFinishWorkout(startedAt, startedAt, startedAt + MAX_INACTIVE_WORKOUT_MS)).toBe(
      true,
    );
  });

  it('allows a workout to continue past three hours after recent use', () => {
    const lastActiveAt = startedAt + MAX_INACTIVE_WORKOUT_MS - 20 * 60 * 1000;

    expect(
      shouldAutoFinishWorkout(startedAt, lastActiveAt, startedAt + MAX_INACTIVE_WORKOUT_MS),
    ).toBe(false);
    expect(inactiveWorkoutFinishAt(startedAt, lastActiveAt)).toBe(
      lastActiveAt + RECENT_WORKOUT_ACTIVITY_MS,
    );
  });

  it('finishes after the extended workout becomes inactive', () => {
    const lastActiveAt = startedAt + MAX_INACTIVE_WORKOUT_MS + 25 * 60 * 1000;
    const finishAt = lastActiveAt + RECENT_WORKOUT_ACTIVITY_MS;

    expect(shouldAutoFinishWorkout(startedAt, lastActiveAt, finishAt - 1)).toBe(false);
    expect(shouldAutoFinishWorkout(startedAt, lastActiveAt, finishAt)).toBe(true);
  });

  it('extends the deadline when the user is active shortly before it expires', () => {
    const initialFinishAt = startedAt + MAX_INACTIVE_WORKOUT_MS;
    const activityAt = initialFinishAt - 10 * 60 * 1000;

    expect(extendInactiveWorkoutFinishAt(initialFinishAt, activityAt)).toBe(
      activityAt + RECENT_WORKOUT_ACTIVITY_MS,
    );
  });

  it('does not revive a workout after its inactivity deadline has passed', () => {
    const initialFinishAt = startedAt + MAX_INACTIVE_WORKOUT_MS;

    expect(extendInactiveWorkoutFinishAt(initialFinishAt, initialFinishAt + 1)).toBe(
      initialFinishAt,
    );
  });

  it("uses the account's auto-save time while it is on, keeping the activity grace", () => {
    try {
      setInactiveWorkoutLimitMinutes(90);
      expect(inactiveWorkoutFinishAt(startedAt, startedAt)).toBe(startedAt + 90 * 60 * 1000);
      const lastActiveAt = startedAt + 80 * 60 * 1000;
      expect(inactiveWorkoutFinishAt(startedAt, lastActiveAt)).toBe(
        lastActiveAt + RECENT_WORKOUT_ACTIVITY_MS,
      );
      setInactiveWorkoutLimitMinutes(null);
      expect(inactiveWorkoutFinishAt(startedAt, startedAt)).toBe(
        startedAt + MAX_INACTIVE_WORKOUT_MS,
      );
    } finally {
      setInactiveWorkoutLimitMinutes(null);
    }
  });
});

describe('an inactive workout prompt', () => {
  const at = (day: number, hour: number, minute: number) =>
    new Date(2026, 10, day, hour, minute).getTime();
  const time = (value: number) =>
    new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  it('gives the end time alone on the day the workout started', () => {
    const times = inactiveWorkoutTimes(at(23, 9, 0), at(23, 10, 12));
    expect(times.ended).toBe(time(at(23, 10, 12)));
    expect(times.started).toContain(time(at(23, 9, 0)));
  });

  it('gives the end day too after midnight', () => {
    const times = inactiveWorkoutTimes(at(23, 23, 0), at(24, 0, 30));
    expect(times.ended).not.toBe(time(at(24, 0, 30)));
    expect(times.ended).toContain(time(at(24, 0, 30)));
  });
});
