import { describe, expect, it } from 'vitest';
import { cardioZoneNotice, DEFAULT_CARDIO_PREFERENCES } from './cardioZones';

const preferences = {
  heart_rate_zones: [
    { zone: 2, min_bpm: 110, max_bpm: 139 },
    { zone: 3, min_bpm: 140, max_bpm: 159 },
  ],
  goals: [{ zone: 2, minutes: 150 }],
};
describe('cardio zone notification', () => {
  it('counts only the matching inclusive range and clearly estimates from average HR', () => {
    expect(cardioZoneNotice(110, 30, preferences)).toContain('Estimated Zone 2');
    expect(cardioZoneNotice(139, 30, preferences)).toContain('30 min towards your Zone 2 goal');
    expect(cardioZoneNotice(140, 30, preferences)).toContain('No goal set for this zone');
    expect(cardioZoneNotice(160, 30, preferences)).toContain('no goal credit');
  });
  it('explains missing HR or ranges without claiming goal credit', () => {
    expect(cardioZoneNotice(null, 30, preferences)).toContain('Add average heart rate');
    expect(cardioZoneNotice(120, 30, DEFAULT_CARDIO_PREFERENCES)).toContain(
      'Set your heart-rate zones',
    );
  });
});
