import { describe, expect, it } from 'vitest';
import { cardioSessionUpdateFromScan, cardioSetUpdateFromScan } from './cardioScreenshot';
import type { CardioScreenshotScan, Exercise } from './types';

function scan(update: Partial<CardioScreenshotScan> = {}): CardioScreenshotScan {
  return {
    session_date: '2026-09-19',
    activity_type: 'Treadmill',
    duration_minutes: 32,
    calories_kcal: 418,
    average_heart_rate_bpm: 147,
    distance_km: 5.4,
    average_speed_kph: 10.1,
    fields_found: ['duration', 'active calories', 'heart rate', 'distance', 'speed'],
    warning: null,
    ...update,
  };
}

describe('cardio screenshot set mapping', () => {
  it('maps scanned workout metrics into a cardio set', () => {
    expect(cardioSetUpdateFromScan(scan())).toEqual({
      duration_seconds: 1920,
      calories_kcal: 418,
      average_heart_rate_bpm: 147,
      distance_km: 5.4,
      speed_kph: 10.1,
    });
  });

  it('leaves existing set values alone when a metric was not recognized', () => {
    expect(
      cardioSetUpdateFromScan(
        scan({
          calories_kcal: null,
          average_heart_rate_bpm: null,
          distance_km: null,
        }),
      ),
    ).toEqual({ duration_seconds: 1920, speed_kph: 10.1 });
  });
});

describe('standalone cardio screenshot mapping', () => {
  const exercises = [{ id: 'treadmill', name: 'Treadmill', kind: 'cardio' } as Exercise];

  it('matches activities case-insensitively and clears fields the scan does not fill', () => {
    expect(
      cardioSessionUpdateFromScan(
        scan({ activity_type: 'treadmill', calories_kcal: null, elevation_gain_m: 125 }),
        exercises,
      ),
    ).toEqual({
      update: {
        session_date: '2026-09-19',
        exercise_id: 'treadmill',
        activity_type: 'Treadmill',
        duration_minutes: 32,
        calories_kcal: null,
        average_heart_rate_bpm: 147,
        distance_km: 5.4,
        average_speed_kph: 10.1,
        elevation_gain_m: 125,
        incline_percent: null,
        average_power_watts: null,
        average_mets: null,
      },
      warning: '',
    });
  });

  it('leaves date, duration and selected activity alone when they cannot be matched', () => {
    const { update, warning } = cardioSessionUpdateFromScan(
      scan({
        session_date: null,
        duration_minutes: null,
        activity_type: 'Cycling',
        warning: 'No calories found.',
      }),
      exercises,
    );
    expect(update).not.toHaveProperty('session_date');
    expect(update).not.toHaveProperty('duration_minutes');
    expect(update).not.toHaveProperty('exercise_id');
    expect(warning).toBe(
      'Cycling is not in the activity list, so the current activity was kept. No calories found.',
    );
  });
});
