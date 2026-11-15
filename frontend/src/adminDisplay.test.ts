import { describe, expect, it } from 'vitest';
import {
  LIMIT_GROUPS,
  formatBytes,
  formatLastActive,
  limitDraft,
  parseLimitDraft,
  plural,
  validLimit,
  videoQueueSummary,
} from './adminDisplay';
import type { AccountLimits, AccountLimitsSettings } from './types';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1536, '1.5 KB'],
    [20 * 1024 * 1024, '20 MB'],
    [100 * 1024 ** 3, '100 GB'],
  ])('formats %d as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('formatLastActive', () => {
  const now = new Date('2026-10-10T12:00:00Z');

  it.each([
    [null, 'Never'],
    ['2026-10-10T11:55:00Z', 'Just now'],
    ['2026-10-10T11:30:00Z', '30 min ago'],
    ['2026-10-10T07:00:00Z', '5 h ago'],
    ['2026-10-09T10:00:00Z', 'Yesterday'],
    ['2026-10-01T12:00:00Z', '9 days ago'],
    ['2026-08-01T12:00:00Z', '1 Aug 2026'],
    ['not a date', 'Unknown'],
  ])('describes %s as %s', (value, expected) => {
    expect(formatLastActive(value, now)).toBe(expected);
  });
});

describe('videoQueueSummary', () => {
  it('lists only the busy stages', () => {
    expect(
      videoQueueSummary({ queued: 2, normalizing: 1, stitching: 0, youtube_processing: 0 }),
    ).toBe('2 waiting · 1 encoding');
  });

  it('reports an empty queue as idle', () => {
    expect(videoQueueSummary({ queued: 0, normalizing: 0 })).toBe('Idle');
  });
});

describe('plural', () => {
  it('uses the singular only for one', () => {
    expect(plural(1, 'device')).toBe('1 device');
    expect(plural(0, 'device')).toBe('0 devices');
    expect(plural(3, 'device')).toBe('3 devices');
  });
});

const limits: AccountLimits = {
  workouts_per_account: 5000,
  cardio_sessions_per_account: 5000,
  custom_exercises_per_account: 100,
  photos_per_account: 25,
  workout_photos_per_account: 500,
  saves_per_minute: 60,
  exercises_per_workout: 20,
  sets_per_workout: 100,
  workout_note_characters: 2000,
  exercise_note_characters: 1000,
  set_note_characters: 500,
  photo_upload_megabytes: 5,
};
const bounds = Object.fromEntries(
  Object.keys(limits).map((name) => [name, { minimum: 1, maximum: 10_000 }]),
) as AccountLimitsSettings['bounds'];

describe('account limit drafts', () => {
  it('shows every limit in exactly one group', () => {
    const shown = LIMIT_GROUPS.flatMap((group) => group.fields.map((field) => field.name));
    expect(shown.sort()).toEqual(Object.keys(limits).sort());
  });

  it('accepts whole numbers within bounds', () => {
    expect(validLimit('25', { minimum: 1, maximum: 100 })).toBe(true);
    expect(validLimit(' 100 ', { minimum: 1, maximum: 100 })).toBe(true);
    for (const text of ['', '0', '101', '2.5', '-3', 'ten']) {
      expect(validLimit(text, { minimum: 1, maximum: 100 })).toBe(false);
    }
  });

  it('turns a draft back into numbers, or nothing while one is invalid', () => {
    const draft = { ...limitDraft(limits), photos_per_account: '30' };
    expect(parseLimitDraft(draft, bounds)).toEqual({ ...limits, photos_per_account: 30 });
    expect(parseLimitDraft({ ...draft, sets_per_workout: '' }, bounds)).toBeNull();
  });
});
