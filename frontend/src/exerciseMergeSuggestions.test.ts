import { describe, expect, it } from 'vitest';
import { isMatchedWord, mergeSuggestions } from './exerciseMergeSuggestions';
import type { Exercise } from './types';

let id = 0;
function exercise(
  name: string,
  muscle_group: string,
  equipment: string | null,
  extra: Partial<Exercise> = {},
): Exercise {
  id += 1;
  return {
    id: `exercise-${id}`,
    name,
    category: 'push',
    kind: 'strength',
    muscle_group,
    equipment,
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
    ...extra,
  };
}
const custom = (name: string, muscle: string, equipment: string | null) =>
  exercise(name, muscle, equipment, { is_custom: true });

const library = [
  exercise('Dumbbell Bench Press', 'Chest', 'Dumbbell'),
  exercise('Barbell Bench Press', 'Chest', 'Barbell', { alternative_names: ['Bench Press'] }),
  exercise('Lateral Raise', 'Shoulders', 'Dumbbell'),
  exercise('Cable Lateral Raise', 'Shoulders', 'Cable'),
  exercise('Overhead Press', 'Shoulders', 'Barbell', { alternative_names: ['Military Press'] }),
  exercise('Triceps Pushdown', 'Triceps', 'Cable'),
  exercise('EZ Bar Skullcrusher', 'Triceps', 'EZ bar'),
  exercise('Romanian Deadlift', 'Hamstrings', 'Barbell'),
  exercise('Lying Leg Curl', 'Hamstrings', 'Machine'),
  exercise('Lat Pulldown', 'Lats', 'Cable'),
  exercise('Leg Extension', 'Quads', 'Machine'),
  exercise('Dumbbell Curl', 'Biceps', 'Dumbbell'),
  exercise('Cable Biceps Curl', 'Biceps', 'Cable'),
  exercise('My other press', 'Chest', 'Dumbbell', { is_custom: true }),
  exercise('Treadmill Run', 'Cardio', null, { kind: 'cardio', category: 'cardio' }),
];
const top = (source: Exercise) => mergeSuggestions(source, library)[0]?.exercise.name;

describe('mergeSuggestions', () => {
  it.each([
    ['DB Bench Press', 'Chest', 'Dumbbell', 'Dumbbell Bench Press'],
    ['Lateral raises', 'Shoulders', 'Dumbbell', 'Lateral Raise'],
    ['Skullcrushers', 'Triceps', 'EZ bar', 'EZ Bar Skullcrusher'],
    ['Tricep rope pushdown', 'Triceps', 'Cable', 'Triceps Pushdown'],
    ['Benchpress', 'Chest', 'Barbell', 'Barbell Bench Press'],
    ['Lat pull down', 'Lats', 'Cable', 'Lat Pulldown'],
    ['RDL', 'Hamstrings', 'Barbell', 'Romanian Deadlift'],
    ['Hamstring curl', 'Hamstrings', 'Machine', 'Lying Leg Curl'],
    ['Leg ext', 'Quads', 'Machine', 'Leg Extension'],
    ['Latteral raise', 'Shoulders', 'Dumbbell', 'Lateral Raise'],
    ['Military press', 'Shoulders', 'Barbell', 'Overhead Press'],
  ])('suggests %s → the standard exercise', (name, muscle, equipment, expected) => {
    expect(top(custom(name, muscle, equipment))).toBe(expected);
  });

  it('scores a known alternative name as a certain match', () => {
    const [suggestion] = mergeSuggestions(custom('military  PRESS', 'Shoulders', null), library);
    expect(suggestion).toMatchObject({ score: 1, ready: false });
    expect(suggestion.exercise.name).toBe('Overhead Press');
  });

  it('never suggests another equipment variant than the one the name gives', () => {
    const names = mergeSuggestions(custom('DB press', 'Chest', null), library).map(
      (item) => item.exercise.name,
    );
    expect(names).toContain('Dumbbell Bench Press');
    expect(names).not.toContain('Barbell Bench Press');
  });

  it('prefers the custom exercise’s own equipment and ready merges', () => {
    expect(
      mergeSuggestions(custom('Bicep curl', 'Biceps', 'Dumbbell'), library).map(
        (item) => item.exercise.name,
      ),
    ).toEqual(['Dumbbell Curl', 'Cable Biceps Curl']);
    expect(
      mergeSuggestions(custom('Lateral raises', 'Shoulders', 'Dumbbell'), library).map((item) => [
        item.exercise.name,
        item.ready,
      ]),
    ).toEqual([
      ['Lateral Raise', true],
      ['Cable Lateral Raise', false],
    ]);
  });

  it('lowers a name match that works different muscles', () => {
    const score = (muscle: string) =>
      mergeSuggestions(custom('Rope pushdown', muscle, 'Cable'), library)[0]?.score ?? 0;
    expect(score('Triceps')).toBeGreaterThanOrEqual(0.6);
    expect(score('Lats')).toBeLessThan(0.6);
  });

  it('suggests only standard exercises of the same kind, for custom exercises', () => {
    expect(mergeSuggestions(custom('My other press', 'Chest', 'Dumbbell'), library)).toEqual([]);
    expect(mergeSuggestions(custom('Treadmill run', 'Cardio', null), library)).toEqual([]);
    expect(mergeSuggestions(library[0], library)).toEqual([]);
    expect(mergeSuggestions(custom('Neck harness', 'Neck', null), library)).toEqual([]);
  });

  it('honours the limit and minimum score', () => {
    const source = custom('Lateral raises', 'Shoulders', 'Dumbbell');
    expect(mergeSuggestions(source, library, { limit: 1 })).toHaveLength(1);
    expect(mergeSuggestions(source, library, { minimum: 0.8 })).toHaveLength(1);
  });

  it('reports the matched words for highlighting', () => {
    const [suggestion] = mergeSuggestions(custom('DB Bench', 'Chest', null), library);
    const words = 'Dumbbell Bench Press'.split(' ');
    expect(words.filter((word) => isMatchedWord(word, suggestion.matchedWords))).toEqual([
      'Dumbbell',
      'Bench',
    ]);
  });
});
