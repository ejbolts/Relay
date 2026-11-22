import { describe, expect, it } from 'vitest';
import {
  cardioSessionContextLabel,
  cardioSessionEnergy,
  cardioSessionPerformance,
  estimatedMetric,
  filterCardioHistory,
} from './cardioHistory';
import { cardioTrendSelection } from './cardioTrend';
import type { CardioSession } from './types';

const session = (overrides: Partial<CardioSession> = {}): CardioSession => ({
  id: 'session',
  session_date: '2026-11-18',
  activity_type: 'Running',
  duration_minutes: 30,
  calories_kcal: null,
  average_heart_rate_bpm: null,
  distance_km: null,
  average_speed_kph: null,
  incline_percent: null,
  average_mets: null,
  intensity: null,
  zone: null,
  qualifies_zone2: false,
  notes: null,
  source_workout_id: null,
  created_at: '',
  updated_at: '',
  ...overrides,
});

describe('cardio history rows', () => {
  it('filters sessions logged alone or with a workout', () => {
    const alone = session({ id: 'alone' });
    const withWorkout = session({ id: 'with', workout_context: 'workout_plus_cardio' });
    expect(filterCardioHistory([alone, withWorkout], 'all')).toHaveLength(2);
    expect(filterCardioHistory([alone, withWorkout], 'pure_cardio')).toEqual([alone]);
    expect(filterCardioHistory([alone, withWorkout], 'workout_plus_cardio')).toEqual([withWorkout]);
  });

  it('names the workout a session was logged with, or its zone', () => {
    expect(
      cardioSessionContextLabel(
        session({ workout_context: 'workout_plus_cardio', source_workout_name: 'Upper workout' }),
      ),
    ).toBe('With Upper');
    expect(cardioSessionContextLabel(session({ zone: 'Zone 2' }))).toBe('Zone 2');
    expect(cardioSessionContextLabel(session())).toBe('Cardio only');
  });

  it('reads calories as energy and fat equivalent', () => {
    expect(cardioSessionEnergy(session(), 'kg')).toBe('Calories not logged');
    expect(cardioSessionEnergy(session({ calories_kcal: 385 }), 'kg')).toBe(
      '385 kcal · ≈ 50 g fat burnt',
    );
  });

  it('joins logged metrics and marks estimates', () => {
    expect(cardioSessionPerformance(session())).toBe('Performance metrics not logged');
    expect(
      cardioSessionPerformance(
        session({ average_heart_rate_bpm: 142, distance_km: 5, estimated_mets: 9.8 }),
      ),
    ).toBe('142 bpm avg · 5 km · ≈\u00A09.8\u00A0MET avg');
    expect(estimatedMetric(null, true, 'm')).toBeNull();
  });
});

describe('cardio trend selection', () => {
  const sessions = [
    session({ id: 'this', session_date: '2026-11-17', distance_km: 5, duration_minutes: 30 }),
    session({ id: 'last', session_date: '2026-11-10', distance_km: 3, duration_minutes: 20 }),
    session({
      id: 'ride',
      session_date: '2026-11-11',
      activity_type: 'Cycling',
      distance_km: 20,
      duration_minutes: 45,
    }),
  ];

  it('selects the newest week and compares it with the week before', () => {
    const view = cardioTrendSelection(sessions, '2026-11-16', '2026-11-22', 'time', null, null);
    expect(view.weeks).toHaveLength(9);
    expect(view.selected.start).toBe('2026-11-16');
    expect(view.value).toBe(30);
    expect(view.difference).toBe(-35);
    expect(view.maximum).toBe(65);
  });

  it('keeps distances within one kind of movement', () => {
    const view = cardioTrendSelection(
      sessions,
      '2026-11-16',
      '2026-11-22',
      'distance',
      '2026-11-09',
      'cycle',
    );
    expect(view.distanceGroup?.label).toBe('Cycling');
    expect(view.selected.start).toBe('2026-11-09');
    expect(view.value).toBe(20);
    expect(view.metric.unit).toBe('km');
  });
});
