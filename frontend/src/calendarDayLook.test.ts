import { describe, expect, it } from 'vitest';
import { calendarDayLook, weekStripLabels } from './calendarDayLook';
import type { HeatmapDay, WorkoutType } from './types';
import { DEFAULT_WORKOUT_TYPES, builtinTypeColors } from './workoutTypes';
import { weekStartDayFromPreference } from './weekStartDay';

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
      ['2026-11-21', 'lower'],
      ['2026-11-24', 'upper'],
    ]);
    const missed = calendarDayLook({
      date: '2026-11-21',
      today: '2026-11-22',
      entry: undefined,
      types,
      categoryColors: colors,
      splitDays,
    });
    expect(missed).toMatchObject({ scheduledColor: '#f59e0b', scheduledNote: 'Lower body missed' });
    const planned = calendarDayLook({
      date: '2026-11-24',
      today: '2026-11-22',
      entry: undefined,
      types,
      categoryColors: colors,
      splitDays,
    });
    expect(planned.scheduledNote).toBe('Upper body planned');
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
    ).toBeUndefined();
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

  it('reads the preferred first day of the week', () => {
    expect(weekStartDayFromPreference('sunday')).toBe(0);
    expect(weekStartDayFromPreference('saturday')).toBe(6);
    expect(weekStartDayFromPreference('monday')).toBe(1);
    expect(weekStartDayFromPreference(undefined)).toBe(1);
  });
});
