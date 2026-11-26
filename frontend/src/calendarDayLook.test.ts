import { describe, expect, it } from 'vitest';
import { calendarDayLook, todayOutlineColors, weekStripLabels } from './calendarDayLook';
import type { HeatmapDay, WorkoutType } from './types';
import { DEFAULT_WORKOUT_TYPES, builtinTypeColors } from './workoutTypes';

const types = DEFAULT_WORKOUT_TYPES;
const colors = builtinTypeColors(types);
const day = (categories: HeatmapDay['categories']): HeatmapDay => ({
  workout_date: '2026-11-20',
  categories,
  workout_count: categories.length,
  set_count: 12,
  workouts: [],
});
const type = (id: string) => types.find((item) => item.id === id) as WorkoutType;

describe('calendar day look', () => {
  it('outlines a logged day in the colours of its types still shown', () => {
    const mixed = day(['upper', 'cardio']);
    const look = calendarDayLook({
      date: '2026-11-20',
      today: '2026-11-22',
      entry: mixed,
      types,
      categoryColors: colors,
    });
    expect(look.dayTypes.map((item) => item.id)).toEqual(['upper', 'cardio']);
    expect(look.ring).toEqual(['#8b5cf6', '#22c55e']);
    expect(look.filteredOut).toBe(false);

    const hidden = calendarDayLook({
      date: '2026-11-20',
      today: '2026-11-22',
      entry: mixed,
      types,
      categoryColors: colors,
      hiddenCategories: new Set(['upper', 'cardio']),
    });
    expect(hidden).toMatchObject({ ring: [], filteredOut: true });
  });

  it("outlines an empty day faintly for the split's planned or missed workout", () => {
    const splitDays = new Map([
      ['2026-11-21', ['lower']],
      ['2026-11-24', ['upper']],
      ['2026-11-25', ['upper', 'cardio']],
    ]);
    const missed = calendarDayLook({
      date: '2026-11-21',
      today: '2026-11-22',
      entry: undefined,
      types,
      categoryColors: colors,
      splitDays,
    });
    expect(missed).toMatchObject({
      scheduledRing: ['#f59e0b'],
      scheduledNote: 'Lower body missed',
    });
    const planned = calendarDayLook({
      date: '2026-11-24',
      today: '2026-11-22',
      entry: undefined,
      types,
      categoryColors: colors,
      splitDays,
    });
    expect(planned.scheduledNote).toBe('Upper body planned');
    // A mixed day plans each of its types, split around the outline; hidden types drop out.
    const mixed = (hiddenCategories?: Set<string>) =>
      calendarDayLook({
        date: '2026-11-25',
        today: '2026-11-22',
        entry: undefined,
        types,
        categoryColors: colors,
        hiddenCategories,
        splitDays,
      });
    expect(mixed()).toMatchObject({
      scheduledRing: ['#8b5cf6', colors.cardio],
      scheduledNote: 'Upper body + Cardio planned',
    });
    expect(mixed(new Set(['cardio'])).scheduledRing).toEqual(['#8b5cf6']);
    // A logged day or the live workout's day shows no plan.
    expect(
      calendarDayLook({
        date: '2026-11-24',
        today: '2026-11-22',
        entry: undefined,
        inProgress: true,
        types,
        splitDays,
      }).scheduled,
    ).toEqual([]);
  });

  it('colours today by its workout type whether or not it has started', () => {
    // Before anything is started: the split's plan for today, split into arcs on a mixed day.
    expect(todayOutlineColors({ ring: [], scheduledRing: ['#8b5cf6', '#22c55e'] })).toEqual([
      '#8b5cf6',
      '#22c55e',
    ]);
    // Logged today: the logged types, not the plan.
    expect(todayOutlineColors({ ring: ['#f59e0b'], scheduledRing: [] })).toEqual(['#f59e0b']);
    // While a workout is live: the type being logged.
    expect(todayOutlineColors({ ring: ['#f59e0b'], scheduledRing: [] }, '#ec4899')).toEqual([
      '#ec4899',
    ]);
    // Nothing logged or planned: the plain outline.
    expect(todayOutlineColors({ ring: [], scheduledRing: [] })).toEqual([]);
  });

  it('names at most two types on a week strip tile, counting the rest', () => {
    expect(weekStripLabels([type('upper')], colors)).toEqual([
      { id: 'upper', text: 'Upper', color: '#8b5cf6' },
    ]);
    expect(
      weekStripLabels([type('lower'), type('cardio'), type('push')], colors, new Set(['lower'])),
    ).toEqual([
      { id: 'lower', text: 'Lower', color: null },
      { id: 'cardio', text: '+2', color: null },
    ]);
  });
});
