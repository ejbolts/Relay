import { describe, expect, it } from 'vitest';
import type { CardioSession } from './types';
import {
  cardioDistanceGroups,
  cardioTrendWeeks,
  cardioWeekTotals,
  distanceGroupFor,
  groupCardioHistory,
} from './cardioTrend';

const session = (overrides: Partial<CardioSession> = {}): CardioSession => ({
  id: 'session',
  session_date: '2026-10-24',
  activity_type: 'Cycling',
  duration_minutes: 30,
  calories_kcal: null,
  average_heart_rate_bpm: null,
  distance_km: null,
  average_speed_kph: null,
  incline_percent: null,
  average_mets: null,
  intensity: null,
  zone: 'Zone 2',
  qualifies_zone2: true,
  notes: null,
  source_workout_id: null,
  created_at: '',
  updated_at: '',
  ...overrides,
});

describe('weekly cardio trend', () => {
  it('combines standalone and workout cardio, duration-weights recorded averages, and excludes future dates', () => {
    const totals = cardioWeekTotals(
      [
        session({
          duration_minutes: 10,
          average_mets: 6,
          average_heart_rate_bpm: 120,
          calories_kcal: 0,
          distance_km: 2,
        }),
        session({
          id: 'workout',
          duration_minutes: 30,
          average_mets: 4,
          average_heart_rate_bpm: 140,
          source_workout_id: 'workout',
          workout_context: 'workout_plus_cardio',
          distance_km: 8,
        }),
        session({ id: 'unlogged', duration_minutes: 20 }),
        session({ id: 'future', session_date: '2026-10-25', duration_minutes: 100 }),
        session({ id: 'old', session_date: '2026-10-18', duration_minutes: 100 }),
      ],
      '2026-10-19',
      '2026-10-24',
    );
    expect(totals).toMatchObject({
      end: '2026-10-25',
      sessions: 3,
      time: 60,
      metMinutes: 180,
      mets: 4.5,
      heartRate: 135,
      distance: 10,
      calories: 0,
    });
  });

  it('distinguishes missing metric data from zero and fills empty weeks across a year boundary', () => {
    const weeks = cardioTrendWeeks([], '2027-01-04', '2027-01-06');
    expect(weeks).toHaveLength(9);
    expect(weeks[7]).toMatchObject({
      start: '2026-12-28',
      end: '2027-01-03',
      time: 0,
      distance: null,
      calories: null,
      metMinutes: null,
      mets: null,
      heartRate: null,
    });
    expect(weeks[8].start).toBe('2027-01-04');
  });

  it('rounds weighted averages to API precision before formatting heart rate', () => {
    const totals = cardioWeekTotals(
      [
        session({ duration_minutes: 30, average_heart_rate_bpm: 136 }),
        session({ duration_minutes: 35, average_heart_rate_bpm: 135 }),
      ],
      '2026-10-19',
      '2026-10-24',
    );
    expect(totals.heartRate).toBe(135.5);
    expect(totals.heartRate!.toFixed(0)).toBe('136');
  });

  it.each([
    [1, '2026-10-19'],
    [0, '2026-10-18'],
    [6, '2026-10-24'],
  ])('groups history using week-start preference %s', (day, start) => {
    const groups = groupCardioHistory(
      [session(), session({ session_date: '2026-10-10' })],
      day as number,
    );
    expect(groups[0].start).toBe(start);
    expect(groups[0].sessions).toHaveLength(1);
  });

  it.each([
    ['Running', 'foot'],
    ['Incline Treadmill Walking', 'foot'],
    ['Walking', 'foot'],
    ['Cycling (Indoor)', 'cycle'],
    ['Spin class', 'cycle'],
    ['Rowing', 'row'],
    ['Pool swim', 'swim'],
    ['Elliptical', 'activity:elliptical'],
  ])('classifies %s distance as %s', (activity, key) => {
    expect(distanceGroupFor(activity).key).toBe(key);
  });

  it('lists only groups with distance in range, most used first', () => {
    const groups = cardioDistanceGroups(
      [
        session({ id: 'ride', distance_km: 20 }),
        session({ id: 'run', activity_type: 'Running', distance_km: 5 }),
        session({ id: 'walk', activity_type: 'Walking', distance_km: 3 }),
        session({ id: 'stairs', activity_type: 'Stair Climber' }),
        session({
          id: 'old row',
          activity_type: 'Rowing',
          session_date: '2026-09-01',
          distance_km: 4,
        }),
      ],
      '2026-10-01',
      '2026-10-24',
    );
    expect(groups).toEqual([
      { key: 'foot', label: 'Walk & run', sessions: 2, distance: 8 },
      { key: 'cycle', label: 'Cycling', sessions: 1, distance: 20 },
    ]);
  });
});
