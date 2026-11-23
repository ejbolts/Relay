import { describe, expect, it } from 'vitest';
import { MAX_LIVE_CLOCK_SECONDS } from './workoutPause';
import { workoutTimeFields, workoutTimeSeconds } from './workoutTimeCorrection';

describe('workout time correction', () => {
  it('starts from the clock in whole hours and minutes', () => {
    expect(workoutTimeFields(10 * 60 + 59)).toEqual({ hours: '0', minutes: '10' });
    expect(workoutTimeFields(2 * 3600 + 50 * 60)).toEqual({ hours: '2', minutes: '50' });
    expect(workoutTimeFields(40 * 3600)).toEqual({ hours: '23', minutes: '59' });
  });

  it('adds the fields up, keeping each in range and reading anything else as 0', () => {
    expect(workoutTimeSeconds('0', '45')).toBe(45 * 60);
    expect(workoutTimeSeconds('1', '5')).toBe(65 * 60);
    expect(workoutTimeSeconds('1.9', '90')).toBe(3600 + 59 * 60);
    expect(workoutTimeSeconds('-2', 'abc')).toBe(0);
    expect(workoutTimeSeconds('', '')).toBe(0);
    expect(workoutTimeSeconds('99', '99')).toBe(MAX_LIVE_CLOCK_SECONDS);
  });
});
