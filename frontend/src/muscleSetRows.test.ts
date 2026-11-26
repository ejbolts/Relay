import { describe, expect, it } from 'vitest';
import {
  muscleSetsView,
  muscleWeekName,
  setChangeLabel,
  setChangeTone,
  setCredits,
  signedSetChange,
} from './muscleSetRows';

const week = (start: string, sets: Record<string, number>) => ({
  week_start: start,
  week_end: start,
  muscle_groups: Object.entries(sets).map(([muscle_group, raw_sets]) => ({
    muscle_group,
    raw_sets,
    contributions: [],
  })),
});

const thisWeek = week('2026-11-16', { Chest: 6, Back: 8, Biceps: 0, Glutes: 3 });
const lastWeek = week('2026-11-09', { Chest: 4, Back: 8, Hamstrings: 5 });

describe('muscle set rows', () => {
  it('orders by sets, keeps muscles trained only the week before and compares each row', () => {
    const view = muscleSetsView({
      weeklySets: thisWeek,
      history: [lastWeek],
      weeksAgo: 0,
      goal: 10,
      goals: { Chest: 12 },
      expanded: false,
    });
    expect(view.rows.map((row) => row.muscle_group)).toEqual([
      'Back',
      'Chest',
      'Glutes',
      'Hamstrings',
    ]);
    expect(view.rows[1]).toMatchObject({ raw_sets: 6, previous: 4, change: 2, target: 12 });
    expect(view.rows[3]).toMatchObject({ raw_sets: 0, previous: 5, change: -5, target: 10 });
    expect(view).toMatchObject({ current: true, name: 'This week', trainedCount: 4 });
    // Biceps (0 sets) and Hamstrings (0 this week) count as not trained.
    expect(view.untrained).toBe(2);
    expect(view.canExpand).toBe(true);
    expect(view.scale).toBeCloseTo(12 * 1.15);
  });

  it('expands to every muscle and steps back through history, clamped to the weeks there are', () => {
    const expanded = muscleSetsView({
      weeklySets: thisWeek,
      history: [lastWeek],
      weeksAgo: 0,
      goal: 10,
      expanded: true,
    });
    expect(expanded.rows.map((row) => row.muscle_group)).toContain('Biceps');
    expect(expanded.canExpand).toBe(true);

    const earlier = muscleSetsView({
      weeklySets: thisWeek,
      history: [lastWeek],
      weeksAgo: 5,
      goal: 10,
      expanded: false,
    });
    expect(earlier).toMatchObject({ weeksAgo: 1, current: false, name: 'Last week' });
    expect(earlier.previous).toBeUndefined();
    expect(earlier.rows.every((row) => row.previous === null && row.change === null)).toBe(true);
  });

  it('collapses to the first eight trained muscles and handles no data', () => {
    const many = week(
      '2026-11-16',
      Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`M${index}`, 10 - index])),
    );
    const view = muscleSetsView({ weeklySets: many, weeksAgo: 0, goal: 10, expanded: false });
    expect(view.rows).toHaveLength(8);
    expect(view.canExpand).toBe(true);

    const empty = muscleSetsView({ weeklySets: null, weeksAgo: 0, goal: 10, expanded: false });
    expect(empty).toMatchObject({ rows: [], trainedCount: 0, canExpand: false, current: true });
  });

  it('names weeks and changes as the card shows them', () => {
    expect([0, 1, 3].map(muscleWeekName)).toEqual(['This week', 'Last week', '3 weeks ago']);
    expect(setCredits(2.5)).toBe('2.5');
    expect(setCredits(1 / 3)).toBe('0.333');
    expect([2, -1.5, 0].map(signedSetChange)).toEqual(['+2', '−1.5', '±0']);
    expect(setChangeTone(-2, true)).toBe('pending');
    expect(setChangeTone(-2, false)).toBe('down');
    expect(setChangeTone(1, true)).toBe('up');
    expect(setChangeTone(0, false)).toBe('same');
    expect(setChangeLabel(-2, true)).toBe('2 to match the week before');
    expect(setChangeLabel(-2, false)).toBe('down 2 on the week before');
    expect(setChangeLabel(3, true)).toBe('up 3 on the week before');
    expect(setChangeLabel(0, true)).toBe('same as the week before');
  });
});
