import { describe, expect, it } from 'vitest';
import {
  cardioMetricDraft,
  cardioMetricErrors,
  cardioMetricFields,
  emptyCardioSession,
  parseCardioMetrics,
} from './cardioForm';
import {
  cardioZoneDrafts,
  DEFAULT_CARDIO_PREFERENCES,
  parseCardioZoneRanges,
  zonesFromMaxHeartRate,
} from './cardioZones';
import type { Exercise } from './types';

describe('cardio form rules', () => {
  it('defaults to incline treadmill walking and a 30 minute session', () => {
    const exercises = [
      { id: 'cycle', name: 'Cycling' },
      { id: 'walk', name: 'Incline Treadmill Walking' },
    ] as Exercise[];
    expect(emptyCardioSession(exercises, '2026-09-19')).toMatchObject({
      exercise_id: 'walk',
      activity_type: 'Incline Treadmill Walking',
      duration_minutes: 30,
      session_date: '2026-09-19',
      calories_kcal: null,
      qualifies_zone2: false,
    });
  });

  it('distinguishes blanks from zeros and exposes power only for cycling', () => {
    const draft = cardioMetricDraft({ calories_kcal: 0, average_power_watts: 125 });
    expect(parseCardioMetrics(draft)).toMatchObject({
      calories_kcal: 0,
      average_heart_rate_bpm: null,
      average_power_watts: 125,
    });
    expect(
      cardioMetricFields('Stationary Bike').some(({ key }) => key === 'average_power_watts'),
    ).toBe(true);
    expect(cardioMetricFields('Treadmill').some(({ key }) => key === 'average_power_watts')).toBe(
      false,
    );
    expect(
      cardioMetricErrors(
        { ...draft, calories_kcal: '0.5', average_heart_rate_bpm: '255', distance_km: 'abc' },
        'Cycling',
      ),
    ).toMatchObject({
      calories_kcal: expect.any(String),
      average_heart_rate_bpm: expect.any(String),
      distance_km: expect.any(String),
    });
  });

  it('allows no personal ranges, and requires complete whole, non-overlapping ranges when set', () => {
    expect(parseCardioZoneRanges(cardioZoneDrafts(DEFAULT_CARDIO_PREFERENCES))).toEqual([]);
    const zones = zonesFromMaxHeartRate(190);
    expect(parseCardioZoneRanges(zones)[1]).toEqual({ zone: 2, min_bpm: 114, max_bpm: 132 });
    expect(() => parseCardioZoneRanges([{ ...zones[0], min: '95.5' }, ...zones.slice(1)])).toThrow(
      'whole heart rates',
    );
    expect(() => parseCardioZoneRanges([{ ...zones[0], max: '114' }, ...zones.slice(1)])).toThrow(
      'overlapping',
    );
    expect(() => parseCardioZoneRanges([{ ...zones[0], max: '' }, ...zones.slice(1)])).toThrow(
      'all five zones',
    );
  });
});
