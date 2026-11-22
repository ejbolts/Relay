import { describe, expect, it } from 'vitest';
import { splitDayName, splitSkipMessage, splitSkipMove } from './splitSkip';
import type { TrainingSplit, WorkoutRecommendation } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';

const today = '2026-11-22';
// A calendar split that started today: Upper today, then Lower, then a rest day.
const split: TrainingSplit = {
  name: 'Upper / Lower',
  enabled: true,
  start_date: today,
  progression: 'calendar',
  steps: [{ workout_type_id: 'upper' }, { workout_type_id: 'lower' }, { workout_type_id: null }],
};
const recommendation = {
  category: 'upper',
  session_name: 'Upper body',
  split_name: 'Upper / Lower',
} as WorkoutRecommendation;

describe('skipping a split day', () => {
  it("moves from Up next's split day to the next workout day", () => {
    const move = splitSkipMove(split, recommendation, false, today);
    expect(move).toEqual({ split, from: 0, to: 1 });
    expect(splitSkipMessage(move!, DEFAULT_WORKOUT_TYPES)).toBe(
      'Skipped Upper body · Lower body is up next',
    );
  });

  it('offers no skip without a split day to skip', () => {
    expect(splitSkipMove(null, recommendation, false, today)).toBeNull();
    expect(splitSkipMove({ ...split, enabled: false }, recommendation, false, today)).toBeNull();
    expect(splitSkipMove(split, { ...recommendation, split_name: null }, false, today)).toBeNull();
    expect(splitSkipMove(split, recommendation, true, today)).toBeNull();
    expect(
      splitSkipMove(split, { ...recommendation, scheduled_date: '2026-11-23' }, false, today),
    ).toBeNull();
    // A split with one workout day has nowhere to skip to.
    const single = { ...split, steps: [{ workout_type_id: 'upper' }, { workout_type_id: null }] };
    expect(splitSkipMove(single, recommendation, false, today)).toBeNull();
  });

  it('names split days', () => {
    expect(splitDayName(split, 1, DEFAULT_WORKOUT_TYPES)).toBe('Lower body');
    expect(splitDayName(split, 2, DEFAULT_WORKOUT_TYPES)).toBe('rest day');
    expect(
      splitDayName({ ...split, steps: [{ workout_type_id: 'gone' }] }, 0, DEFAULT_WORKOUT_TYPES),
    ).toBe('workout');
  });
});
