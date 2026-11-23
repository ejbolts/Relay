import { describe, expect, it } from 'vitest';
import {
  IMPORTED_BODYWEIGHT_NOTE,
  checkInEditPayload,
  weighInDraft,
  weighInPayload,
} from './bodyCheckInForm';
import { bodyGoalPayload, bodyGoalProgressPercent } from './bodyGoalForm';
import { trailingWeekAverageKg } from './bodyTrend';
import { goalStartLabel, weightChangeLabel } from './bodyMeasurementHistory';
import type { BodyMeasurement, BodyWeightGoal } from './types';

const entry: BodyMeasurement = {
  id: 'm1',
  measurement_date: '2026-11-20',
  weight_kg: 84.2,
  body_fat_pct: 18,
  notes: IMPORTED_BODYWEIGHT_NOTE,
  is_sample: false,
  created_at: '',
};

describe('weigh-in form', () => {
  it('fills a saved day without the import note and checks the weight', () => {
    expect(weighInDraft(entry)).toEqual({ weight: 84.2, bodyFat: '18', notes: '' });
    expect(weighInDraft(undefined)).toEqual({ weight: null, bodyFat: '', notes: '' });
    expect(weighInPayload('2026-11-21', { weight: 0, bodyFat: '', notes: '' }, 'kg').error).toBe(
      'Enter a body weight above 0 and up to 500 kg.',
    );
    expect(
      weighInPayload('2026-11-21', { weight: 83, bodyFat: '17.5', notes: ' ok ' }, 'kg'),
    ).toEqual({
      error: null,
      payload: { measurement_date: '2026-11-21', weight_kg: 83, body_fat_pct: 17.5, notes: 'ok' },
    });
  });

  it('edits a check-in, dropping the import note and checking body fat', () => {
    expect(checkInEditPayload(entry, 84, '75', 'kg').error).toBe(
      'Enter a body-fat percentage between 1 and 70, or leave it blank.',
    );
    expect(checkInEditPayload(entry, 84, '', 'kg').payload).toEqual({
      measurement_date: '2026-11-20',
      weight_kg: 84,
      body_fat_pct: null,
      notes: null,
    });
  });
});

describe('goal form', () => {
  const base = {
    target: 80,
    minimum: null,
    maximum: null,
    targetDate: '2027-02-01',
    latestKg: 84,
    editing: null,
    today: '2026-11-20',
    unit: 'kg' as const,
  };

  it('starts a new goal from the latest weigh-in', () => {
    expect(bodyGoalPayload({ ...base, kind: 'loss' })).toEqual({
      error: null,
      payload: {
        start_date: '2026-11-20',
        target_date: '2027-02-01',
        start_weight_kg: 84,
        target_weight_kg: 80,
        active: true,
      },
    });
  });

  it('refuses a target on the wrong side and an empty range', () => {
    expect(bodyGoalPayload({ ...base, kind: 'gain' }).error).toBe(
      'For a weight-gain goal, choose a target above your current 84 kg.',
    );
    expect(bodyGoalPayload({ ...base, kind: 'maintain' }).error).toBe(
      'Enter a minimum and a higher maximum, both above 0 and at most 500 kg.',
    );
    expect(bodyGoalPayload({ ...base, kind: 'loss', targetDate: '' }).error).toBe(
      'Log a current weight, target weight, and target date first.',
    );
  });

  it('saves a range at its middle and keeps an edited goal’s start', () => {
    expect(
      bodyGoalPayload({ ...base, kind: 'maintain', minimum: 82, maximum: 84 }).payload,
    ).toMatchObject({ start_weight_kg: 83, target_weight_kg: 83, maintenance_min_kg: 82 });
    const editing = {
      id: 'g1',
      start_date: '2026-10-01',
      start_weight_kg: 88,
      target_weight_kg: 82,
    } as BodyWeightGoal;
    expect(bodyGoalPayload({ ...base, kind: 'loss', editing }).payload).toMatchObject({
      start_date: '2026-10-01',
      start_weight_kg: 88,
    });
    expect(bodyGoalProgressPercent(editing, 85)).toBe(50);
  });
});

describe('trend and history labels', () => {
  it('averages the week ending on a day', () => {
    const weights = [
      { measurement_date: '2026-11-20', weight_kg: 84 },
      { measurement_date: '2026-11-15', weight_kg: 86 },
      { measurement_date: '2026-11-13', weight_kg: 90 },
    ];
    expect(trailingWeekAverageKg(weights, '2026-11-20')).toBe(85);
  });

  it('says how a change compares with the goal', () => {
    expect(
      weightChangeLabel(
        {
          direction: 'down',
          current_kg: 84,
          previous_kg: 84.4,
          status: 'favorable',
          goalDirection: 'loss',
        },
        '0.4',
        'kg',
        'previous check-in',
      ),
    ).toBe('Weight decreased by 0.4 kg since previous check-in; in line with weight-loss goal');
    expect(goalStartLabel('2026-11-03', new Date('2026-12-01T12:00:00'))).not.toMatch(/2026/);
    expect(goalStartLabel('2025-11-03', new Date('2026-12-01T12:00:00'))).toMatch(/2025/);
  });
});
