import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CARDIO_PREFERENCES,
  cardioZoneNotice,
  invalidZoneFields,
  withZoneMax,
  zonesFromMaxHeartRate,
} from './cardioZones';

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

describe('zone settings helpers', () => {
  it('fills the standard bands from a maximum heart rate without overlaps', () => {
    expect(zonesFromMaxHeartRate(190)).toEqual([
      { zone: 1, min: '95', max: '113' },
      { zone: 2, min: '114', max: '132' },
      { zone: 3, min: '133', max: '151' },
      { zone: 4, min: '152', max: '170' },
      { zone: 5, min: '171', max: '190' },
    ]);
  });

  it('carries a zone’s To into the next From unless that was set by hand', () => {
    const empty = [1, 2, 3, 4, 5].map((zone) => ({ zone, min: '', max: '' }));
    const first = withZoneMax(empty, 0, '114');
    expect(first[1].min).toBe('115');
    // The next From followed the old To, so it keeps following.
    expect(withZoneMax(first, 0, '120')[1].min).toBe('121');
    const handSet = first.map((item, row) => (row === 1 ? { ...item, min: '118' } : item));
    expect(withZoneMax(handSet, 0, '116')[1].min).toBe('118');
  });

  it('marks empty and overlapping fields', () => {
    const zones = zonesFromMaxHeartRate(190);
    expect(invalidZoneFields(zones).size).toBe(0);
    zones[2] = { zone: 3, min: '130', max: '' };
    expect([...invalidZoneFields(zones)].sort()).toEqual(['2:max', '3:max', '3:min']);
    expect(
      invalidZoneFields([1, 2, 3, 4, 5].map((zone) => ({ zone, min: '', max: '' }))).size,
    ).toBe(0);
  });
});
