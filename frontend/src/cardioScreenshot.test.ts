import { describe, expect, it } from 'vitest';
import { cardioSetUpdateFromScan } from './cardioScreenshot';
import type { CardioScreenshotScan } from './types';

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
