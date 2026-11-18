import { describe, expect, it } from 'vitest';
import {
  appendOlderWorkouts,
  hasOlderHistory,
  initialHistoryStart,
  keepLoadedBefore,
  olderHistoryWindow,
  prependOlderDays,
} from './historyWindow';
import type { HeatmapDay, TrackedWorkout } from './types';
import { addDays, weekStartFor } from './trainingSummary';

const summary = (first: string | null) => ({
  total_workouts: first ? 1 : 0,
  first_workout_date: first,
  last_workout_date: first,
  has_sample_workouts: false,
});
const workout = (id: string, workout_date: string) => ({ id, workout_date }) as TrackedWorkout;
const day = (workout_date: string) => ({ workout_date }) as HeatmapDay;

describe('history windows', () => {
  it('loads enough whole months for a complete twelve-week activity window', () => {
    expect(initialHistoryStart(new Date(2026, 9, 15, 12))).toBe('2026-07-01');
    expect(initialHistoryStart(new Date(2026, 2, 1, 12))).toBe('2025-12-01');
    expect(initialHistoryStart(new Date(2026, 10, 13, 12))).toBe('2026-08-01');
    expect(initialHistoryStart(new Date(2026, 9, 31, 12))).toBe('2026-08-01');
  });

  it.each([2024, 2026])(
    'covers every week start across month and year boundaries in %i',
    (year) => {
      for (let month = 0; month < 12; month++) {
        for (const day of [1, 15, 28]) {
          const today = new Date(year, month, day, 12);
          const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const start = initialHistoryStart(today);
          expect(start).toMatch(/-01$/);
          for (const weekStart of [0, 1, 6]) {
            expect(start <= addDays(weekStartFor(date, weekStart), -11 * 7)).toBe(true);
          }
          expect(olderHistoryWindow(start).end < start).toBe(true);
          expect(addDays(olderHistoryWindow(start).end, 1)).toBe(start);
        }
      }
    },
  );

  it('steps back six whole months, across years', () => {
    expect(olderHistoryWindow('2026-05-01')).toEqual({ start: '2025-11-01', end: '2026-04-30' });
    expect(olderHistoryWindow('2025-03-01')).toEqual({ start: '2024-09-01', end: '2025-02-28' });
  });

  it('knows when workouts precede the loaded window', () => {
    expect(hasOlderHistory('2026-05-01', summary('2019-02-03'))).toBe(true);
    expect(hasOlderHistory('2026-05-01', summary('2026-05-01'))).toBe(false);
    expect(hasOlderHistory('2026-05-01', summary(null))).toBe(false);
    expect(hasOlderHistory('2026-05-01', undefined)).toBe(false);
  });

  it('merges older windows without duplicates', () => {
    expect(
      appendOlderWorkouts(
        [workout('a', '2026-06-01'), workout('b', '2026-05-01')],
        [workout('b', '2026-05-01'), workout('c', '2026-04-30')],
      ).map((item) => item.id),
    ).toEqual(['a', 'b', 'c']);
    expect(
      prependOlderDays(
        [day('2026-05-01'), day('2026-06-01')],
        [day('2026-04-30'), day('2026-05-01')],
      ).map((item) => item.workout_date),
    ).toEqual(['2026-04-30', '2026-05-01', '2026-06-01']);
  });

  it('keeps only what loaded beyond a refresh window', () => {
    const loaded = [day('2026-06-01'), day('2025-12-01'), day('2025-10-31')];
    // Loaded back to November while a refresh of the May window was in flight.
    expect(keepLoadedBefore(loaded, '2026-05-01', '2025-11-01')).toEqual([day('2025-12-01')]);
    // Nothing older was loaded, so stale cached days are dropped.
    expect(keepLoadedBefore(loaded, '2026-05-01', '2026-05-01')).toEqual([]);
  });
});
