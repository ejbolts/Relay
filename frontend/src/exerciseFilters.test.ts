import { describe, expect, it } from 'vitest';
import { EXERCISE_BODY_PARTS, matchesExerciseFilters } from './exerciseFilters';

describe('matchesExerciseFilters', () => {
  const press = { category: 'push' as const, equipment: 'DB' };

  it('shows everything with no filter', () => {
    expect(matchesExerciseFilters(press, 'all', '')).toBe(true);
  });

  it('matches the body part and the normalised equipment together', () => {
    expect(matchesExerciseFilters(press, 'push', 'Dumbbell')).toBe(true);
    expect(matchesExerciseFilters(press, 'pull', 'Dumbbell')).toBe(false);
    expect(matchesExerciseFilters(press, 'push', 'Barbell')).toBe(false);
  });

  it('offers the body parts in the picker order', () => {
    expect(EXERCISE_BODY_PARTS[0]).toBe('push');
    expect(EXERCISE_BODY_PARTS.at(-1)).toBe('other');
  });
});
