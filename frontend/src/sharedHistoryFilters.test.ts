import { describe, expect, it } from 'vitest';
import {
  linkedSharedWorkoutId,
  linkedWorkoutNeedsMore,
  NO_SHARED_WORKOUT_FILTERS,
  sameSharedFilters,
  sharedFilterDatesInvalid,
  sharedFiltersDay,
  sharedFiltersForExercise,
  sharedFiltersWithMachine,
  sharedFiltersForTarget,
  sharedFiltersOnDay,
  sharedWorkoutFilterCount,
  sharedWorkoutFilterLabel,
  sharedWorkoutQuery,
  sharedWorkoutTypeChoices,
  sharedWorkoutTypeValue,
  withSharedWorkoutType,
} from './sharedHistoryFilters';
import type { WorkoutType } from './types';

const target = { id: 'w1', workout_date: '2026-03-04' };

describe('shared history filters', () => {
  it('counts the filters set, treating a date range as one filter', () => {
    expect(sharedWorkoutFilterCount(NO_SHARED_WORKOUT_FILTERS)).toBe(0);
    expect(sharedWorkoutFilterCount(sharedFiltersOnDay('2026-03-04'))).toBe(1);
    expect(
      sharedWorkoutFilterCount({ ...NO_SHARED_WORKOUT_FILTERS, start_date: '2026-03-01' }),
    ).toBe(1);
    expect(sharedWorkoutFilterCount({ ...NO_SHARED_WORKOUT_FILTERS, end_date: '2026-03-31' })).toBe(
      1,
    );
    expect(
      sharedWorkoutFilterCount({
        ...NO_SHARED_WORKOUT_FILTERS,
        start_date: '2026-03-01',
        end_date: '2026-03-31',
        exercise_id: 'bench',
      }),
    ).toBe(2);
    expect(
      sharedWorkoutFilterCount({ ...sharedFiltersForExercise('bench'), workout_type_id: 't1' }),
    ).toBe(2);
  });

  it('formats the filter button accessibility label', () => {
    expect(sharedWorkoutFilterLabel(0)).toBe('Filter workouts');
    expect(sharedWorkoutFilterLabel(1)).toBe('Filter workouts, 1 filter on');
    expect(sharedWorkoutFilterLabel(2)).toBe('Filter workouts, 2 filters on');
  });

  it('opens on a linked workout’s day, or unfiltered', () => {
    expect(sharedFiltersForTarget(target)).toEqual({
      ...NO_SHARED_WORKOUT_FILTERS,
      start_date: '2026-03-04',
      end_date: '2026-03-04',
    });
    expect(sharedFiltersForTarget(undefined)).toBe(NO_SHARED_WORKOUT_FILTERS);
  });

  it('adds a machine to the filters chosen, keeping the others', () => {
    const machine = sharedFiltersWithMachine(NO_SHARED_WORKOUT_FILTERS, 'm1');
    expect(machine).toEqual({ ...NO_SHARED_WORKOUT_FILTERS, machine_photo_id: 'm1' });
    expect(sharedWorkoutFilterCount(machine)).toBe(1);
    const day = sharedFiltersOnDay('2026-03-04');
    expect(sharedFiltersWithMachine(day, 'm2')).toEqual({ ...day, machine_photo_id: 'm2' });
    expect(sharedFiltersWithMachine(machine, 'm2').machine_photo_id).toBe('m2');
    expect(day.machine_photo_id).toBe('');
  });

  it('tells filters asking for the same workouts apart from different ones', () => {
    const day = sharedFiltersOnDay('2026-03-04');
    expect(sameSharedFilters(day, sharedFiltersForTarget(target))).toBe(true);
    expect(sameSharedFilters(day, { ...day, end_date: '2026-03-05' })).toBe(false);
    expect(sameSharedFilters(day, { ...day, workout_type_id: 't1' })).toBe(false);
    expect(sameSharedFilters({ ...day, workout_type_id: '' }, day)).toBe(true);
    expect(sameSharedFilters(NO_SHARED_WORKOUT_FILTERS, sharedFiltersForExercise('bench'))).toBe(
      false,
    );
  });

  it('reads the one day a calendar tap or link shows, and no day for a range', () => {
    expect(sharedFiltersDay(sharedFiltersOnDay('2026-03-04'))).toBe('2026-03-04');
    expect(
      sharedFiltersDay({
        ...NO_SHARED_WORKOUT_FILTERS,
        start_date: '2026-03-04',
        end_date: '2026-03-05',
      }),
    ).toBeNull();
    expect(sharedFiltersDay({ ...NO_SHARED_WORKOUT_FILTERS, start_date: '2026-03-04' })).toBeNull();
    expect(sharedFiltersDay(NO_SHARED_WORKOUT_FILTERS)).toBeNull();
    expect(sharedFiltersDay(sharedFiltersForExercise('bench'))).toBeNull();
  });

  it('keeps the linked workout only while the filters show just its day', () => {
    const day = sharedFiltersForTarget(target);
    expect(linkedSharedWorkoutId(target, day)).toBe('w1');
    expect(linkedSharedWorkoutId(undefined, day)).toBeUndefined();
    expect(linkedSharedWorkoutId(target, { ...day, end_date: '2026-03-05' })).toBeUndefined();
    expect(linkedSharedWorkoutId(target, { ...day, category: 'push' })).toBeUndefined();
    expect(linkedSharedWorkoutId(target, { ...day, workout_type_id: 't1' })).toBeUndefined();
    expect(linkedSharedWorkoutId(target, { ...day, exercise_id: 'bench' })).toBeUndefined();
    expect(linkedSharedWorkoutId(target, { ...day, machine_photo_id: 'm1' })).toBeUndefined();
    expect(linkedSharedWorkoutId(target, NO_SHARED_WORKOUT_FILTERS)).toBeUndefined();
  });

  it('rejects a From date after the To date', () => {
    expect(
      sharedFilterDatesInvalid({ ...NO_SHARED_WORKOUT_FILTERS, start_date: '2026-03-05' }),
    ).toBe(false);
    expect(
      sharedFilterDatesInvalid({
        ...NO_SHARED_WORKOUT_FILTERS,
        start_date: '2026-03-05',
        end_date: '2026-03-04',
      }),
    ).toBe(true);
    expect(sharedFilterDatesInvalid(sharedFiltersOnDay('2026-03-04'))).toBe(false);
  });

  it('reads older pages until the linked workout loads or the server runs out', () => {
    expect(linkedWorkoutNeedsMore([{ id: 'a' }], 'w1', 3)).toBe(true);
    expect(linkedWorkoutNeedsMore([{ id: 'a' }, { id: 'w1' }], 'w1', 3)).toBe(false);
    expect(linkedWorkoutNeedsMore([{ id: 'a' }], 'w1', 1)).toBe(false);
    expect(linkedWorkoutNeedsMore([{ id: 'a' }], undefined, 3)).toBe(false);
  });

  it('adds the history tab’s kind to the query', () => {
    expect(sharedWorkoutQuery(NO_SHARED_WORKOUT_FILTERS)).toBe(NO_SHARED_WORKOUT_FILTERS);
    expect(sharedWorkoutQuery(NO_SHARED_WORKOUT_FILTERS, 'cardio')).toEqual({
      ...NO_SHARED_WORKOUT_FILTERS,
      kind: 'cardio',
    });
  });

  it('chooses a built-in category or a custom type, one replacing the other', () => {
    const custom = withSharedWorkoutType(NO_SHARED_WORKOUT_FILTERS, 'custom:t1');
    expect(custom).toMatchObject({ category: '', workout_type_id: 't1' });
    expect(sharedWorkoutTypeValue(custom)).toBe('custom:t1');
    const push = withSharedWorkoutType(custom, 'push');
    expect(push.category).toBe('push');
    expect('workout_type_id' in push).toBe(false);
    expect(sharedWorkoutTypeValue(push)).toBe('push');
    expect(sharedWorkoutTypeValue(withSharedWorkoutType(push, ''))).toBe('');
  });

  it('offers all types, the categories, then only the member’s custom types', () => {
    const types = [
      { id: 'upper', name: 'Upper', is_custom: false },
      { id: 't1', name: 'Arms', is_custom: true },
    ] as WorkoutType[];
    const choices = sharedWorkoutTypeChoices({ exercises: [], machines: [], workout_types: types });
    expect(choices[0]).toEqual({ value: '', label: 'All types' });
    expect(choices).toContainEqual({ value: 'push', label: 'Push' });
    expect(choices.at(-1)).toEqual({ value: 'custom:t1', label: 'Arms' });
    expect(choices.some((choice) => choice.label === 'Upper')).toBe(false);
    expect(sharedWorkoutTypeChoices({ exercises: [], machines: [] })).toHaveLength(8);
  });
});
