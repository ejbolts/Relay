import { describe, expect, it } from 'vitest';
import {
  CYCLING_DISTANCES,
  OTHER_DISTANCES,
  ROWING_DISTANCES,
  RUNNING_DISTANCES,
  SWIMMING_DISTANCES,
  cardioRecordLabel,
  formatRecordDistance,
  formatRecordTime,
  paceDistances,
  savedCardioRecordsToast,
} from './cardioRecords';
import { prSetCount, recentRecords } from './trainingSummary';
import type { PersonalRecord } from './types';
import { recordDisplayValue } from './weightUnits';

const record = (overrides: Partial<PersonalRecord>): PersonalRecord => ({
  id: 'record',
  exercise_id: 'running',
  workout_id: 'workout',
  set_id: 'set',
  achieved_date: '2026-01-03',
  record_type: 'distance',
  value: 7.2,
  unit: 'km',
  normalized_weight: null,
  formula: null,
  exercise_name: 'Running',
  ...overrides,
});
const distance = record({});
const duration = record({ id: 'duration', record_type: 'duration', value: 2160, unit: 'seconds' });
const fiveK = record({
  id: 'five',
  record_type: 'pace',
  value: 1500,
  unit: 'seconds',
  normalized_weight: 5,
});
const oneK = record({
  id: 'one',
  record_type: 'pace',
  value: 300,
  unit: 'seconds',
  normalized_weight: 1,
});

describe('cardio record rules', () => {
  it.each([
    ['Running', RUNNING_DISTANCES],
    ['Incline Treadmill Walking', RUNNING_DISTANCES],
    ['Rowing', ROWING_DISTANCES],
    ['Cycling (Indoor)', CYCLING_DISTANCES],
    ['Spin bike', CYCLING_DISTANCES],
    ['Open water swim', SWIMMING_DISTANCES],
    ['Elliptical', OTHER_DISTANCES],
  ])('gives %s the set distances of its sport, as the server does', (name, distances) => {
    expect(paceDistances(name)).toEqual(distances);
  });

  it('names distances, times and records as people say them', () => {
    expect([0.5, 1, 21.0975, 42.195].map(formatRecordDistance)).toEqual([
      '500 m',
      '1 km',
      '21.1 km',
      '42.2 km',
    ]);
    expect([117.5, 283.3, 1500.3, 5040].map(formatRecordTime)).toEqual([
      '1:57.5',
      '4:43',
      '25:00',
      '1:24:00',
    ]);
    expect([distance, duration, fiveK].map(cardioRecordLabel)).toEqual([
      'Distance PR',
      'Duration PR',
      'Fastest 5 km',
    ]);
    expect(cardioRecordLabel(record({ record_type: 'weight' }))).toBeNull();
    expect([distance, duration, fiveK].map((item) => recordDisplayValue(item, 'lb'))).toEqual([
      '7.2 km',
      '36:00',
      '25:00',
    ]);
  });

  it('counts a run with several records once and lists its fastest time first', () => {
    expect(prSetCount([distance, duration, oneK, fiveK])).toBe(1);
    expect(recentRecords([distance, duration, oneK, fiveK])).toEqual([fiveK]);
  });

  it('celebrates a saved session’s records one per line, with their values', () => {
    expect(savedCardioRecordsToast([fiveK, record({ record_type: 'weight' })])).toEqual({
      message: 'All-time fastest 5 km',
      lines: [{ title: 'All-time fastest 5 km', detail: 'Running · 25:00' }],
    });
    expect(
      savedCardioRecordsToast([fiveK, { ...duration, scope: 'fresh_start' }, distance])?.lines,
    ).toEqual([
      { title: 'All-time distance PR', detail: 'Running · 7.2 km' },
      { title: 'Fresh start duration PR', detail: 'Running · 36:00' },
      { title: 'All-time fastest 5 km', detail: 'Running · 25:00' },
    ]);
    expect(savedCardioRecordsToast([])).toBeNull();
  });
});
