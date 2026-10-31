import { describe, expect, it } from 'vitest';
import { cardioZoneNotice, DEFAULT_CARDIO_PREFERENCES } from './cardioZones';

const preferences = {
  heart_rate_zones: [
    { zone: 2, min_bpm: 110, max_bpm: 139 },
    { zone: 3, min_bpm: 140, max_bpm: 159 },
  ],
  goals: [{ zone: 2, minutes: 150 }],
};
const session = (zone: string | null, heartRate: number | null) => ({
  zone,
  average_heart_rate_bpm: heartRate,
  duration_minutes: 30,
});
describe('cardio zone notification', () => {
  it('reports the saved zone with its range and goal credit', () => {
    expect(cardioZoneNotice(session('Zone 2', 110), preferences)).toBe(
      'Zone 2 · 110 bpm average (110–139 bpm). 30 min added to your Zone 2 goal.',
    );
    expect(cardioZoneNotice(session('Zone 3', 140), preferences)).toContain(
      'No goal set for Zone 3',
    );
    expect(cardioZoneNotice(session(null, 160), preferences)).toContain('no goal credit');
  });
  it('explains missing HR or ranges', () => {
    expect(cardioZoneNotice(session(null, null), preferences)).toContain('without heart rate');
    expect(cardioZoneNotice(session('Zone 2', 120), DEFAULT_CARDIO_PREFERENCES)).toBe(
      'Logged as Zone 2. 30 min added to your Zone 2 goal. Set heart-rate zones to classify by heart rate.',
    );
  });
});
