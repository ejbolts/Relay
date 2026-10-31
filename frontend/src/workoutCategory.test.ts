import { describe, expect, it } from 'vitest';
import type { WorkoutCategory } from './types';
import {
  finalizeWorkoutIdentity,
  inferWorkoutCategory,
  mixedWorkoutName,
  workoutNameForCategory,
} from './workoutCategory';

const exercises = (...categories: WorkoutCategory[]) =>
  categories.map((category) => ({ category }));

describe('automatic workout category', () => {
  it.each(['Arms', 'Legs', 'Limbs', 'Torso'])(
    'preserves %s instead of inferring an exercise category',
    (name) => {
      expect(
        finalizeWorkoutIdentity(exercises('pull', 'lower', 'cardio'), 'other', '', true, { name }),
      ).toEqual({ category: 'other', name: `${name} + Cardio workout` });
      expect(
        finalizeWorkoutIdentity(exercises('pull'), 'other', 'My session', true, { name }),
      ).toEqual({ category: 'other', name: 'My session' });
    },
  );
  it('uses a focused type when one exercise family clearly dominates', () => {
    expect(inferWorkoutCategory(exercises('pull', 'pull', 'push'))).toBe('pull');
    expect(inferWorkoutCategory(exercises('push', 'push', 'pull'))).toBe('push');
    expect(inferWorkoutCategory(exercises('lower', 'lower', 'pull'))).toBe('lower');
    expect(inferWorkoutCategory(exercises('cardio', 'cardio', 'lower'))).toBe('lower');
  });

  it('uses upper body for a balanced push and pull session', () => {
    expect(inferWorkoutCategory(exercises('push', 'pull'))).toBe('upper');
    expect(inferWorkoutCategory(exercises('push', 'push', 'pull', 'pull'))).toBe('upper');
  });

  it('uses full body for a balanced upper and lower session', () => {
    expect(inferWorkoutCategory(exercises('push', 'lower'))).toBe('full_body');
    expect(inferWorkoutCategory(exercises('pull', 'lower', 'cardio'))).toBe('full_body');
    expect(inferWorkoutCategory(exercises('full_body', 'pull', 'pull'))).toBe('full_body');
  });

  it('handles empty and uncategorized exercise lists', () => {
    expect(inferWorkoutCategory([])).toBeNull();
    expect(inferWorkoutCategory(exercises('other', 'other'))).toBe('other');
  });

  it('provides the matching automatic workout name', () => {
    expect(workoutNameForCategory('pull')).toBe('Pull workout');
    expect(workoutNameForCategory('upper')).toBe('Upper body workout');
    expect(workoutNameForCategory('full_body')).toBe('Full body workout');
  });

  it('applies the inferred type and automatic name only at completion', () => {
    expect(
      finalizeWorkoutIdentity(exercises('pull', 'pull'), 'push', 'Push workout', true),
    ).toEqual({ category: 'pull', name: 'Pull workout' });
    expect(
      finalizeWorkoutIdentity(exercises('pull', 'pull'), 'push', 'Push workout', false),
    ).toEqual({ category: 'push', name: 'Push workout' });
  });

  it('keeps a custom workout name when applying the completed type', () => {
    expect(
      finalizeWorkoutIdentity(exercises('pull', 'pull'), 'push', 'Tuesday training', true),
    ).toEqual({ category: 'pull', name: 'Tuesday training' });
  });
});

describe('mixed-session names', () => {
  it.each([
    [['cardio', 'push', 'pull'], 'Cardio + Upper body workout'],
    [['push', 'pull', 'cardio'], 'Upper body + Cardio workout'],
    [['cardio', 'cardio', 'push', 'pull', 'cardio'], 'Cardio + Upper body + Cardio workout'],
    [['push', 'cardio', 'pull'], 'Upper body + Cardio + Upper body workout'],
  ] as [WorkoutCategory[], string][])(
    'follows the contiguous segments in %j',
    (categories, name) => {
      expect(finalizeWorkoutIdentity(exercises(...categories), 'upper', '', true)).toEqual({
        category: 'upper',
        name,
      });
      expect(mixedWorkoutName(name, exercises(...categories))).toBe(name);
    },
  );

  it('keeps custom names and workout types in the strength segment', () => {
    expect(
      finalizeWorkoutIdentity(exercises('cardio', 'lower'), 'lower', 'Legs + abs', false).name,
    ).toBe('Cardio + Legs + abs');
    expect(
      finalizeWorkoutIdentity(exercises('lower', 'cardio'), 'other', '', false, { name: 'Legs A' })
        .name,
    ).toBe('Legs A + Cardio workout');
  });

  it('names the strength segment even when the session started as the Cardio type', () => {
    expect(
      finalizeWorkoutIdentity(exercises('cardio', 'push', 'pull'), 'cardio', '', false),
    ).toEqual({ category: 'cardio', name: 'Cardio + Upper body workout' });
  });

  it('removes automatic cardio labels when the cardio exercise is removed', () => {
    expect(
      finalizeWorkoutIdentity(exercises('push'), 'upper', 'Cardio + Upper body workout', true),
    ).toEqual({ category: 'push', name: 'Push workout' });
  });

  it('updates old mixed names when exercises move without duplicating labels', () => {
    expect(
      finalizeWorkoutIdentity(
        exercises('cardio', 'push', 'pull'),
        'upper',
        'Upper body + Cardio workout',
        false,
      ).name,
    ).toBe('Cardio + Upper body workout');
    expect(mixedWorkoutName('Cardio + Legs + abs', exercises('lower', 'cardio'))).toBe(
      'Legs + abs + Cardio',
    );
  });

  it('recognises any cardio kind, even with an uncategorized exercise', () => {
    expect(
      mixedWorkoutName('Upper body workout', [
        { category: 'other', kind: 'cardio' },
        { category: 'upper', kind: 'strength' },
      ]),
    ).toBe('Cardio + Upper body workout');
  });

  it('leaves single-mode workouts unchanged and respects the saved name limit', () => {
    expect(mixedWorkoutName('Upper body + Cardio workout', [])).toBe('Upper body + Cardio workout');
    expect(mixedWorkoutName('Cardio workout', exercises('cardio', 'cardio'))).toBe(
      'Cardio workout',
    );
    expect(mixedWorkoutName('Legs + abs', exercises('lower'))).toBe('Legs + abs');
    const name = mixedWorkoutName('A'.repeat(200), exercises('cardio', 'push', 'cardio'));
    expect(name.length).toBeLessThanOrEqual(200);
    expect(name).toMatch(/^Cardio \+ A+… \+ Cardio$/);
  });
});
