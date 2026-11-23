import { describe, expect, it } from 'vitest';
import {
  exerciseMuscleCredits,
  formatMuscleCreditSets,
  isCardioExercise,
  partialSetsEnabledForWeek,
  selectPartialSetWeek,
  weekStartDayFromPreference,
} from './exercisePartialSets';
import type { Exercise } from './types';

const baseExercise: Exercise = {
  id: 'press',
  name: 'Leg Press',
  kind: 'strength',
  category: 'lower',
  muscle_group: 'Quads',
  is_custom: false,
  is_favorite: false,
  equipment: 'Machine',
  muscle_contributions: [],
  default_muscle_set_credits: [
    { muscle_name: 'Quadriceps', sets: 1 },
    { muscle_name: 'Glutes', sets: 0.5 },
    { muscle_name: 'Zero', sets: 0 },
  ],
};

describe('exercisePartialSets', () => {
  it('identifies cardio by kind or category', () => {
    expect(isCardioExercise({ kind: 'cardio', category: 'other' })).toBe(true);
    expect(isCardioExercise({ kind: 'strength', category: 'cardio' })).toBe(true);
    expect(isCardioExercise({ kind: 'strength', category: 'push' })).toBe(false);
  });

  it('splits direct and partial credits, preferring default_muscle_set_credits', () => {
    const split = exerciseMuscleCredits({
      default_muscle_set_credits: baseExercise.default_muscle_set_credits,
      muscle_set_credits: [{ muscle_name: 'Hamstrings', sets: 1 }],
    });
    expect(split.direct).toEqual([{ muscle_name: 'Quadriceps', sets: 1 }]);
    expect(split.partial).toEqual([{ muscle_name: 'Glutes', sets: 0.5 }]);

    const fallback = exerciseMuscleCredits({
      muscle_set_credits: [{ muscle_name: 'Biceps', sets: 1 }],
    });
    expect(fallback.direct).toEqual([{ muscle_name: 'Biceps', sets: 1 }]);
    expect(fallback.partial).toEqual([]);
  });

  it('maps week_start preferences to JS weekday numbers', () => {
    expect(weekStartDayFromPreference('sunday')).toBe(0);
    expect(weekStartDayFromPreference('saturday')).toBe(6);
    expect(weekStartDayFromPreference('monday')).toBe(1);
    expect(weekStartDayFromPreference(undefined)).toBe(1);
  });

  it('snaps picked dates to their week start and ignores future or empty dates', () => {
    expect(selectPartialSetWeek('2026-10-21', '2026-10-26', 1)).toBe('2026-10-19');
    expect(selectPartialSetWeek('2026-10-21', '2026-10-26', 0)).toBe('2026-10-18');
    expect(selectPartialSetWeek('2026-10-27', '2026-10-26', 1)).toBeNull();
    expect(selectPartialSetWeek('', '2026-10-26', 1)).toBeNull();
  });

  it('formats direct and partial credits, turning off disabled partial credits', () => {
    expect(formatMuscleCreditSets(1, false)).toBe('1 set');
    expect(formatMuscleCreditSets(1.5, false)).toBe('1.5 sets');
    expect(formatMuscleCreditSets(0.5, true)).toBe('0.5 sets');
    expect(formatMuscleCreditSets(0.5, false)).toBe('Off');
  });

  it('resolves partialSetsEnabledForWeek from weekly overrides and defaults', () => {
    expect(partialSetsEnabledForWeek(baseExercise, '2026-10-26')).toBe(true);
    expect(
      partialSetsEnabledForWeek({ ...baseExercise, partial_sets_enabled: false }, '2026-10-26'),
    ).toBe(false);
    expect(
      partialSetsEnabledForWeek(
        {
          ...baseExercise,
          partial_sets_default: true,
          partial_set_weeks: [{ week_start: '2026-10-12', enabled: false }],
        },
        '2026-10-19',
      ),
    ).toBe(false);
  });
});
