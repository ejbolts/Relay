import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decimalNumberOrNull,
  formatBytes,
  formatMinutesDuration,
  formatSeconds,
  formatWorkoutTimeRange,
  mergeUniqueById,
  itemsInSelectionOrder,
  localDateOf,
  reorder,
  timesCanRecordDuration,
  workoutDurationMinutes,
  workoutTimeInputValue,
} from './utils';

describe('display formatting', () => {
  it('parses decimal weights from dot and comma keyboards', () => {
    expect(decimalNumberOrNull('7.5')).toBe(7.5);
    expect(decimalNumberOrNull('7,5')).toBe(7.5);
    expect(decimalNumberOrNull('.')).toBeNull();
  });

  it('formats a video size and a timestamp', () => {
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatSeconds(3599)).toBe('59:59');
    expect(formatSeconds(3600)).toBe('1:00:00');
    expect(formatSeconds(3661)).toBe('1:01:01');
  });

  it('formats completed workout durations in hours and minutes', () => {
    expect(formatMinutesDuration(45)).toBe('45min');
    expect(formatMinutesDuration(75)).toBe('1h 15min');
    expect(formatMinutesDuration(120)).toBe('2h');
    expect(formatMinutesDuration(null)).toBe('–');
  });

  it('calculates same-day and overnight workouts from start and end times', () => {
    expect(workoutDurationMinutes('09:15', '10:45')).toBe(90);
    expect(workoutDurationMinutes('23:30', '00:15')).toBe(45);
    expect(workoutDurationMinutes('', '10:45')).toBeNull();
    expect(workoutTimeInputValue('09:15:00')).toBe('09:15');
    expect(formatWorkoutTimeRange('23:30:00', '00:15:00')).toBe('23:30–00:15 next day');
  });
});

describe('workout list helpers', () => {
  const library = [{ id: 'bench' }, { id: 'row' }, { id: 'squat' }];

  it('adds exercises in selection order rather than library order', () => {
    const selected = itemsInSelectionOrder(library, ['squat', 'bench', 'row']);
    expect(mergeUniqueById([{ id: 'existing' }], selected).map((item) => item.id)).toEqual([
      'existing',
      'squat',
      'bench',
      'row',
    ]);
  });

  it('puts a deselected and reselected exercise at the end', () => {
    expect(itemsInSelectionOrder(library, ['row', 'squat', 'bench'])).toEqual([
      library[1],
      library[2],
      library[0],
    ]);
  });

  it('handles empty selections and ignores unavailable exercise IDs', () => {
    expect(itemsInSelectionOrder(library, [])).toEqual([]);
    expect(itemsInSelectionOrder(library, ['squat', 'missing', 'bench'])).toEqual([
      library[2],
      library[0],
    ]);
    expect(library.map((item) => item.id)).toEqual(['bench', 'row', 'squat']);
  });

  it('adds multiple selections predictably without duplicates', () => {
    const existing = [{ id: 'bench', name: 'Bench' }];
    const selected = [
      { id: 'squat', name: 'Squat' },
      { id: 'bench', name: 'Bench' },
      { id: 'row', name: 'Row' },
    ];
    expect(mergeUniqueById(existing, selected).map((item) => item.id)).toEqual([
      'bench',
      'squat',
      'row',
    ]);
  });

  it('reorders items without mutating the original list', () => {
    const original = ['a', 'b', 'c'];
    expect(reorder(original, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(original).toEqual(['a', 'b', 'c']);
  });

  it('moves a complete set record with its note and rest setting', () => {
    const sets = [
      { key: 'warmup', notes: 'Upper pin', rest_seconds: 120 },
      { key: 'working', notes: 'Hard set', rest_seconds: 240 },
      { key: 'drop', notes: 'Reduce weight', rest_seconds: 90 },
    ];

    expect(reorder(sets, 2, 1)).toEqual([
      sets[0],
      { key: 'drop', notes: 'Reduce weight', rest_seconds: 90 },
      sets[1],
    ]);
    expect(sets.map((item) => item.key)).toEqual(['warmup', 'working', 'drop']);
  });
});

describe('localDateOf', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('dates a UTC timestamp by the local calendar day', () => {
    vi.stubEnv('TZ', 'Australia/Sydney');
    expect(localDateOf('2026-11-16T14:27:23.800705Z')).toBe('2026-11-17');
    vi.stubEnv('TZ', 'America/Los_Angeles');
    expect(localDateOf('2026-11-16T04:00:00Z')).toBe('2026-11-15');
    vi.stubEnv('TZ', 'UTC');
    expect(localDateOf('2026-11-16T14:27:23Z')).toBe('2026-11-16');
  });

  it('falls back to the leading date of an unreadable value', () => {
    expect(localDateOf('2026-11-16 later')).toBe('2026-11-16');
  });
});

describe('timesCanRecordDuration', () => {
  it('records anything shorter than a day, but not a 24-hour workout', () => {
    expect(timesCanRecordDuration(1439)).toBe(true);
    expect(timesCanRecordDuration(1440)).toBe(false);
  });
});
