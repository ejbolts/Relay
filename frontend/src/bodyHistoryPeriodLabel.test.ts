import { describe, expect, it } from 'vitest';
import { bodyHistoryPeriodLabel } from './bodyTrend';

describe('Body history period labels', () => {
  it('names the week and month tabs after the chosen statistic', () => {
    expect(bodyHistoryPeriodLabel('week', 'average')).toBe('Avg Week');
    expect(bodyHistoryPeriodLabel('month', 'average')).toBe('Avg Monthly');
    expect(bodyHistoryPeriodLabel('week', 'median')).toBe('Median Week');
    expect(bodyHistoryPeriodLabel('month', 'median')).toBe('Median Monthly');
  });
});
