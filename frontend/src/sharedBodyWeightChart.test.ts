import { describe, expect, it } from 'vitest';
import {
  formatSharedBodyWeightChartValue,
  sharedBodyWeightChartPoints,
  sharedBodyWeightGoalPath,
} from './sharedBodyWeightChart';
import type { SharedGoals } from './types';

const ZONE2 = {
  week_start: '2026-11-16',
  week_end: '2026-11-22',
  goal_minutes: 150,
  completed_minutes: 60,
  remaining_minutes: 90,
  percentage: 40,
  complete: false,
};

describe('sharedBodyWeightChart', () => {
  it('clips a sloped goal path to the charted dates and converts units', () => {
    const goals: SharedGoals = {
      zone2: ZONE2,
      body_weight: {
        start_date: '2026-10-01',
        target_date: '2026-12-01',
        start_weight_kg: 80,
        target_weight_kg: 74,
      },
    };
    const path = sharedBodyWeightGoalPath(goals, '2026-10-15', '2026-11-15', 'kg');
    expect(path).not.toBeNull();
    expect(path?.startDate).toBe('2026-10-15');
    expect(path?.endDate).toBe('2026-11-15');
    expect(path?.startValue).toBeCloseTo(78.62, 1);
    expect(path?.endValue).toBeCloseTo(75.57, 1);
    expect(path?.label).toBe('Goal 74 kg');
    expect(path?.minValue).toBeUndefined();
    expect(path?.maxValue).toBeUndefined();
  });

  it('includes the maintenance band in the viewer unit when present', () => {
    const goals: SharedGoals = {
      zone2: ZONE2,
      body_weight: {
        start_date: '2026-10-01',
        target_date: '2026-12-01',
        start_weight_kg: 80,
        target_weight_kg: 80,
        maintenance_min_kg: 79,
        maintenance_max_kg: 81,
      },
    };
    const path = sharedBodyWeightGoalPath(goals, '2026-10-15', '2026-11-15', 'lb');
    expect(path).not.toBeNull();
    expect(path?.minValue).toBeCloseTo(174.16, 1);
    expect(path?.maxValue).toBeCloseTo(178.57, 1);
    expect(path?.label).toContain('lb');
  });

  it('returns null when there is no goal or it falls outside the chart dates', () => {
    expect(sharedBodyWeightGoalPath(null, '2026-10-01', '2026-11-01', 'kg')).toBeNull();
    const expired: SharedGoals = {
      zone2: ZONE2,
      body_weight: {
        start_date: '2025-01-01',
        target_date: '2025-02-01',
        start_weight_kg: 80,
        target_weight_kg: 75,
      },
    };
    expect(sharedBodyWeightGoalPath(expired, '2026-10-01', '2026-11-01', 'kg')).toBeNull();
  });

  it('converts charted weigh-in points into the viewer unit', () => {
    const points = sharedBodyWeightChartPoints(
      [
        { date: '2026-10-01', value: 80 },
        { date: '2026-11-01', value: 79 },
      ],
      'lb',
    );
    expect(points[0].date).toBe('2026-10-01');
    expect(points[0].value).toBeCloseTo(176.37, 1);
    expect(points[1].value).toBeCloseTo(174.16, 1);
  });

  it('formats charted values without trailing .0 like web TrendChart', () => {
    expect(formatSharedBodyWeightChartValue(78, 'kg')).toBe('78 kg');
    expect(formatSharedBodyWeightChartValue(78.0, 'kg')).toBe('78 kg');
    expect(formatSharedBodyWeightChartValue(76.5, 'kg')).toBe('76.5 kg');
    expect(formatSharedBodyWeightChartValue(171.96, 'lb')).toBe('172 lb');
  });
});
