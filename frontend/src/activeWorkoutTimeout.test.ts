import { describe, expect, it } from 'vitest';
import {
  extendInactiveWorkoutFinishAt,
  inactiveWorkoutFinishAt,
  MAX_INACTIVE_WORKOUT_MS,
  RECENT_WORKOUT_ACTIVITY_MS,
  setInactiveWorkoutLimitMinutes,
  shouldAutoFinishWorkout,
} from './activeWorkoutTimeout';

describe('inactive workout timeout', () => {
  const startedAt = Date.UTC(2026, 8, 19, 9);

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
