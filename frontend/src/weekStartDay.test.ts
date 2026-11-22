import { describe, expect, it } from 'vitest';
import { weekStartDayOf } from './trainingSummary';

describe('week start preference', () => {
  it('names the weekday a week starts on, Monday until preferences load', () => {
    expect(weekStartDayOf('sunday')).toBe(0);
    expect(weekStartDayOf('saturday')).toBe(6);
    expect(weekStartDayOf('monday')).toBe(1);
    expect(weekStartDayOf(undefined)).toBe(1);
  });
});
