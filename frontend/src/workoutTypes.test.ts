import { describe, expect, it } from 'vitest';
import type { HeatmapDay, WorkoutType } from './types';
import {
  builtinTypeColors,
  calendarDayTypes,
  calendarLegendTypes,
  DEFAULT_WORKOUT_TYPES,
  effectiveWorkoutType,
} from './workoutTypes';

const customTypes: WorkoutType[] = ['Arms', 'Legs', 'Limbs', 'Torso'].map((name, index) => ({
  id: `type-${index}`,
  name,
  color: ['#a855f7', '#f97316', '#06b6d4', '#ec4899'][index],
  is_custom: true,
  archived: false,
}));
const day = (workout_types?: WorkoutType[]): HeatmapDay => ({
  workout_date: '2026-10-17',
  categories: ['other', 'cardio'],
  workout_types,
  workout_count: 1,
  set_count: 3,
  workouts: [],
});

describe('account workout types', () => {
  it('lists each custom type in the legend with its own color and no spurious Other entry', () => {
    const types = [...DEFAULT_WORKOUT_TYPES, ...customTypes];
    const days = customTypes.map((type) => day([type]));
    expect(calendarLegendTypes(days, types)).toEqual(customTypes);
    expect(calendarDayTypes(days[0], types)).toEqual([customTypes[0]]);
  });
  it('retains removed historical types and mixed Cardio dots', () => {
    const removed = { ...customTypes[0], archived: true };
    const cardio = DEFAULT_WORKOUT_TYPES.find((type) => type.id === 'cardio')!;
    expect(calendarLegendTypes([day([removed, cardio])], DEFAULT_WORKOUT_TYPES)).toEqual([
      cardio,
      removed,
    ]);
  });
  it('uses saved catalog colour edits immediately and handles cached legacy days', () => {
    const edited = { ...customTypes[0], color: '#123456' };
    expect(calendarDayTypes(day([customTypes[0]]), [edited])[0].color).toBe('#123456');
    expect(calendarDayTypes(day(), DEFAULT_WORKOUT_TYPES).map((type) => type.id)).toEqual([
      'other',
      'cardio',
    ]);
    expect(builtinTypeColors([{ ...DEFAULT_WORKOUT_TYPES[0], color: '#654321' }]).upper).toBe(
      '#654321',
    );
  });
  it('uses owner-provided metadata for custom workouts outside the current account catalog', () => {
    expect(
      effectiveWorkoutType({
        category: 'other',
        workout_type_id: customTypes[0].id,
        workout_type: customTypes[0],
      }),
    ).toEqual(customTypes[0]);
    expect(
      effectiveWorkoutType({
        category: 'push',
        workout_type_id: null,
        workout_type: customTypes[0],
      }).id,
    ).toBe('push');
  });
});
