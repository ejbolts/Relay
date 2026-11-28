import { describe, expect, it } from 'vitest';
import { MAX_LIVE_CLOCK_SECONDS } from './workoutPause';
import {
  correctedSessionSeconds,
  workoutTimeBelowSaved,
  workoutTimeFields,
  workoutTimeSoFarSeconds,
  workoutTimeFieldValid,
  workoutTimeSeconds,
} from './workoutTimeCorrection';

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

  it('accepts only empty fields or whole numbers within range, as the web fields do', () => {
    for (const ok of ['', ' ', '0', '7', '07', '59'])
      expect(workoutTimeFieldValid(ok, 59)).toBe(true);
    for (const bad of ['60', '65', '100', '-1', '1.5', '1e1', 'abc'])
      expect(workoutTimeFieldValid(bad, 59)).toBe(false);
    expect(workoutTimeFieldValid('23', 23)).toBe(true);
    expect(workoutTimeFieldValid('24', 23)).toBe(false);
  });

  it("opens a resumed workout on its whole time, and keeps the saved minutes out of this session's", () => {
    expect(workoutTimeSoFarSeconds(10 * 60 + 30, 40)).toBe(50 * 60 + 30);
    expect(workoutTimeSoFarSeconds(90, 0)).toBe(90);
    expect(correctedSessionSeconds(60 * 60, 40)).toBe(20 * 60);
    expect(correctedSessionSeconds(25 * 60, 0)).toBe(25 * 60);
    // Less than was already saved: this session counts nothing, never time off the saved part.
    expect(correctedSessionSeconds(30 * 60, 40)).toBe(0);
  });

  it('stops a resumed workout going below the minutes already saved, and says so', () => {
    expect(workoutTimeBelowSaved('0', '30', 40)).toBe('At least 40 min, already saved');
    expect(workoutTimeBelowSaved('1', '0', 75)).toBe('At least 1 h 15 min, already saved');
    expect(workoutTimeBelowSaved('0', '40', 40)).toBeNull();
    expect(workoutTimeBelowSaved('0', '0', 0)).toBeNull();
  });
});
