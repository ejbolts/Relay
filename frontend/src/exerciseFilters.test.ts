import { describe, expect, it } from 'vitest';
import {
  CUSTOM_EQUIPMENT_OPTION,
  EXERCISE_BODY_PARTS,
  matchesExerciseFilters,
} from './exerciseFilters';

describe('matchesExerciseFilters', () => {
  const press = { category: 'push' as const, equipment: 'DB', is_custom: false };
  const customPress = { category: 'push' as const, equipment: 'DB', is_custom: true };

  it('shows everything with no filter', () => {
    expect(matchesExerciseFilters(press, 'all', '')).toBe(true);
  });

  it('matches the body part and the normalised equipment together', () => {
    expect(matchesExerciseFilters(press, 'push', 'Dumbbell')).toBe(true);
    expect(matchesExerciseFilters(press, 'pull', 'Dumbbell')).toBe(false);
    expect(matchesExerciseFilters(press, 'push', 'Barbell')).toBe(false);
  });

  it('filters to custom exercises only when customOnly is enabled', () => {
    expect(matchesExerciseFilters(press, 'all', '', true)).toBe(false);
    expect(matchesExerciseFilters(customPress, 'all', '', true)).toBe(true);
    expect(matchesExerciseFilters(customPress, 'pull', '', true)).toBe(false);
    expect(matchesExerciseFilters(customPress, 'push', 'Dumbbell', true)).toBe(true);
    expect(CUSTOM_EQUIPMENT_OPTION).toBe(':custom');
  });

  it('offers the body parts in the picker order', () => {
    expect(EXERCISE_BODY_PARTS[0]).toBe('push');
    expect(EXERCISE_BODY_PARTS.at(-1)).toBe('other');
  });
});
