import { describe, expect, it } from 'vitest';
import {
  historyPageAnchor,
  historyPageCount,
  historyPageForDate,
  historyPageWindow,
  upsertWorkoutByRecency,
  workoutPageForId,
} from './workoutHistory';

describe('Sessions pages', () => {
  // Friday 13 November 2026, with weeks starting on Monday.
  const today = '2026-11-13';

  it('starts with this week and last week, then two calendar weeks per page', () => {
    expect(historyPageWindow(today, 1, 1)).toEqual({ start: '2026-11-02', end: null });
    expect(historyPageWindow(today, 1, 2)).toEqual({ start: '2026-10-19', end: '2026-11-01' });
    expect(historyPageWindow(today, 1, 3)).toEqual({ start: '2026-10-05', end: '2026-10-18' });
    expect(historyPageWindow(today, 0, 1)).toEqual({ start: '2026-11-01', end: null });
  });

  it('finds the page holding a date, keeping future workouts on page 1', () => {
    expect(historyPageForDate('2026-11-14', today, 1)).toBe(1);
    expect(historyPageForDate('2026-11-02', today, 1)).toBe(1);
    expect(historyPageForDate('2026-11-01', today, 1)).toBe(2);
    expect(historyPageForDate('2026-10-19', today, 1)).toBe(2);
    expect(historyPageForDate('2026-10-18', today, 1)).toBe(3);
    expect(historyPageForDate('2026-11-30', today, 1)).toBe(1);
  });

  it('counts back from the latest workout after a break, but not from a future one', () => {
    expect(historyPageAnchor(today, '2026-11-12')).toBe('2026-11-12');
    expect(historyPageAnchor(today, '2026-10-14')).toBe('2026-10-14');
    expect(historyPageAnchor(today, '2026-11-20')).toBe(today);
    expect(historyPageAnchor(today, null)).toBe(today);
    expect(historyPageWindow(historyPageAnchor(today, '2026-10-14'), 1, 1).start).toBe(
      '2026-10-05',
    );
  });

  it('counts pages back to the oldest workout across a year boundary', () => {
    expect(historyPageCount(null, today, 1)).toBe(1);
    expect(historyPageCount('2026-11-10', today, 1)).toBe(1);
    expect(historyPageCount('2026-10-25', today, 1)).toBe(2);
    expect(historyPageCount('2025-11-13', today, 1)).toBe(27);
    const window = historyPageWindow(today, 1, 27);
    expect(window.start <= '2025-11-13' && '2025-11-13' <= (window.end ?? '')).toBe(true);
  });
});

describe('workout history navigation', () => {
  const workouts = Array.from({ length: 17 }, (_, index) => ({ id: `workout-${index}` }));

  it('finds the matching page in displayed workout order, including page boundaries', () => {
    expect(workoutPageForId(workouts, 'workout-0', 8)).toBe(1);
    expect(workoutPageForId(workouts, 'workout-7', 8)).toBe(1);
    expect(workoutPageForId(workouts, 'workout-8', 8)).toBe(2);
    expect(workoutPageForId(workouts, 'workout-16', 8)).toBe(3);
  });

  it('targets the exact workout ID even when workouts share a date', () => {
    const sameDayWorkouts = [
      { id: 'evening', workout_date: '2026-08-27' },
      { id: 'morning', workout_date: '2026-08-27' },
    ];
    expect(workoutPageForId(sameDayWorkouts, 'morning', 1)).toBe(2);
    expect(workoutPageForId(sameDayWorkouts, 'evening', 1)).toBe(1);
  });

  it('does not navigate to an unrelated workout when the target is missing', () => {
    expect(workoutPageForId(workouts, 'deleted', 8)).toBeNull();
    expect(workoutPageForId(workouts, null, 8)).toBeNull();
    expect(workoutPageForId([], 'workout-0', 8)).toBeNull();
  });
});

describe('optimistic workout history updates', () => {
  const older = {
    id: 'older',
    workout_date: '2026-08-30',
    created_at: '2026-08-30T08:00:00Z',
  };
  const newer = {
    id: 'newer',
    workout_date: '2026-08-31',
    created_at: '2026-08-31T08:00:00Z',
  };

  it('inserts a saved workout in display order', () => {
    expect(upsertWorkoutByRecency([older], newer)).toEqual([newer, older]);
  });

  it('replaces an edited workout without duplicating it', () => {
    const edited = { ...older, workout_date: '2026-09-01' };

    expect(upsertWorkoutByRecency([newer, older], edited)).toEqual([edited, newer]);
  });
});
