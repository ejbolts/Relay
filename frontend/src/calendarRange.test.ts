import { describe, expect, it } from 'vitest';
import { calendarMonths, monthCountFromOldestWorkout } from './calendarRange';

describe('calendar workout range', () => {
  it('builds complete six-row months across years without skipping a month from a late date', () => {
    const months = calendarMonths('2026-12-31', 2);
    expect(months.map((month) => month.first)).toEqual(['2026-12-01', '2027-01-01']);
    expect(months.map((month) => month.cells.length)).toEqual([42, 42]);
    expect(months[0].cells[0]).toBeNull();
    expect(months[0].cells[1]?.getDate()).toBe(1);
    expect(months.flatMap((month) => month.cells.filter(Boolean))).toHaveLength(62);
    expect(calendarMonths('2026-12-31', 2, 2)[0].first).toBe('2027-02-01');
  });

  it('includes leap day and aligns a Sunday start with the last weekday column', () => {
    const february = calendarMonths('2028-02-29', 2)[0];
    expect(february.cells.filter(Boolean)).toHaveLength(29);
    expect(february.cells.filter(Boolean).at(-1)?.getDate()).toBe(29);
    const sunday = calendarMonths('2026-11-01', 1)[0];
    expect(sunday.cells.slice(0, 6)).toEqual(Array(6).fill(null));
    expect(sunday.cells[6]?.getDate()).toBe(1);
  });
  it('includes every month from the oldest workout through the present month', () => {
    const entries = [
      { workout_date: '2026-08-11' },
      { workout_date: '2020-08-17' },
      { workout_date: '2024-01-05' },
    ];

    expect(monthCountFromOldestWorkout(entries, new Date(2026, 7, 12))).toBe(73);
  });

  it('shows the current month when the history is empty', () => {
    expect(monthCountFromOldestWorkout([], new Date(2026, 7, 12))).toBe(1);
  });
});
