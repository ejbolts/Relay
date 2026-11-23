import { describe, expect, it } from 'vitest';
import {
  activityAverageLabel,
  bodyweightStatCaption,
  bodyweightTrendCaption,
  checkInChange,
  homeActivityStats,
  homeBodyweightStats,
  homeCardioGoals,
  nudgedBodyFat,
  nudgedBodyweightKg,
  quickCheckInEntry,
  signedWeightChange,
} from './homeStats';
import type { BodyMeasurement, DashboardData } from './types';

const measurement = (
  measurement_date: string,
  weight_kg: number,
  body_fat_pct: number | null = null,
): BodyMeasurement => ({
  id: measurement_date,
  measurement_date,
  weight_kg,
  body_fat_pct,
  notes: null,
  is_sample: false,
  created_at: '',
});

describe('Home activity stats', () => {
  const weeks = [1, 2, 3, 4].map((count, index) => ({
    weekStart: `2026-11-0${index + 1}`,
    workouts: count,
    cardioSessions: count * 2,
    sets: 0,
    volumeKg: 0,
  }));

  it('counts this week and averages the chosen number of weeks', () => {
    const stats = homeActivityStats({
      weeks,
      haveWorkouts: true,
      data: null,
      workoutWeeks: 2,
      cardioWeeks: 4,
    });
    expect(stats.workoutsThisWeek).toBe(4);
    expect(stats.cardioSessionsThisWeek).toBe(8);
    expect(stats.workoutHistory).toEqual([3, 4]);
    expect(stats.averageWorkouts).toBe(3.5);
    expect(stats.averageCardioSessions).toBe(5);
    expect(activityAverageLabel(stats.averageWorkouts, 2)).toBe('2-wk avg 3.5');
    expect(activityAverageLabel(null, 8)).toBe('This week');
  });

  it('falls back to the dashboard before any workouts load', () => {
    const data = { workouts_this_week: 2 } as DashboardData;
    const empty = homeActivityStats({
      weeks: [],
      haveWorkouts: false,
      data,
      workoutWeeks: 8,
      cardioWeeks: 8,
    });
    expect(empty.workoutsThisWeek).toBe(2);
    expect(empty.cardioSessionsThisWeek).toBe(0);
    expect(
      homeActivityStats({
        weeks: [],
        haveWorkouts: false,
        data: null,
        workoutWeeks: 8,
        cardioWeeks: 8,
      }).cardioSessionsThisWeek,
    ).toBeNull();
  });
});

describe('Home bodyweight stats', () => {
  const measurements = [
    measurement('2026-11-20', 84.2),
    measurement('2026-11-10', 85, 18.5),
    measurement('2026-10-22', 86.1),
  ];

  it('reads today, the previous readings and the four-week change', () => {
    const stats = homeBodyweightStats(measurements, '2026-11-20', 1);
    expect(stats.today?.weight_kg).toBe(84.2);
    expect(stats.priorBodyweight).toBe(85);
    expect(stats.priorBodyFat).toBe(18.5);
    expect(stats.latestBodyFat).toBe(18.5);
    expect(stats.recentWeights).toEqual([86.1, 85, 84.2]);
    expect(stats.monthChange).toBeCloseTo(-1.9);
    expect(stats.weeklyWeights).toEqual([86.1, 85, 84.2]);
  });

  it('words the cards’ captions', () => {
    expect(signedWeightChange(-1.9, 'kg')).toBe('−1.9 kg');
    expect(signedWeightChange(0, 'kg')).toBe('±0.0 kg');
    expect(bodyweightStatCaption(1.25, 3, 'kg')).toBe('+1.3 kg / 4 wk');
    expect(bodyweightStatCaption(null, 1, 'kg')).toBe('1 check-in');
    expect(bodyweightStatCaption(null, 0, 'kg')).toBe('No check-ins');
    expect(bodyweightTrendCaption(null, 2, 'kg')).toBe('2 check-ins');
    expect(bodyweightTrendCaption(-1, 2, 'lb')).toBe('−2.2 lb in 30 days');
  });
});

describe('Home check-in', () => {
  it('steps weight in the shown unit and body fat within 1–70%', () => {
    expect(nudgedBodyweightKg(80, null, 0.1, 'kg')).toBeCloseTo(80.1);
    expect(nudgedBodyweightKg(null, 82, -0.1, 'kg')).toBeCloseTo(81.9);
    expect(nudgedBodyFat('', 18, 0.1)).toBe('18.1');
    expect(nudgedBodyFat('70', null, 0.1)).toBe('70.0');
  });

  it('checks the weight, and body fat when both are asked for', () => {
    expect(
      quickCheckInEntry({ weightKg: null, bodyFat: NaN, requireBodyFat: false, unit: 'kg' }),
    ).toEqual({ error: 'Enter a bodyweight above 0 and up to 500 kg.' });
    expect(
      quickCheckInEntry({ weightKg: 80, bodyFat: NaN, requireBodyFat: true, unit: 'kg' }).error,
    ).toBe('Enter body fat from 1% to 70%.');
    expect(
      quickCheckInEntry({ weightKg: 80, bodyFat: 18, requireBodyFat: true, unit: 'kg' }),
    ).toEqual({ error: null, weightKg: 80 });
  });

  it('compares today with the reading before, at one decimal', () => {
    expect(checkInChange(84.26, 84.04)).toBe(-0.3);
    expect(checkInChange(null, 84)).toBeNull();
  });
});

describe('Home cardio goals', () => {
  it('uses the zone 2 week when the dashboard has no goal list', () => {
    const zone2 = {
      week_start: '2026-11-16',
      week_end: '2026-11-22',
      goal_minutes: 150,
      completed_minutes: 60,
      remaining_minutes: 90,
      percentage: 40,
      complete: false,
    };
    const { goals, daysLeft } = homeCardioGoals({ zone2 } as DashboardData, '2026-11-20');
    expect(goals).toEqual([{ zone: 2, ...zone2 }]);
    expect(daysLeft).toBe(3);
    expect(homeCardioGoals(null, '2026-11-20')).toEqual({ goals: [], daysLeft: null });
  });
});
