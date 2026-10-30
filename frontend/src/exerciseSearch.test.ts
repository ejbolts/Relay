import { describe, expect, it } from 'vitest';
import {
  fuzzyHighlightIndices,
  fuzzyMatchIndices,
  fuzzyMatchesFields,
  fuzzyScoreFields,
  exerciseSearchScore,
  progressExerciseMatches,
  rankExerciseSearchMatches,
} from './exerciseSearch';

describe('exercise fuzzy search', () => {
  const curls = [
    { id: 'db', name: 'Dumbbell Curl', muscle_group: 'Biceps', equipment: 'Dumbbell' },
    { id: 'cable', name: 'Cable Biceps Curl', muscle_group: 'Biceps', equipment: 'Cable' },
    {
      id: 'machine',
      name: 'Machine Bicep Preacher Curl',
      muscle_group: 'Biceps',
      equipment: 'Machine',
    },
  ];

  it.each(['bicep curl cable', 'cables biceps curl', 'curl (cable)'])(
    'finds the cable variant with %s',
    (query) => {
      expect(progressExerciseMatches(curls, query).map((exercise) => exercise.id)).toEqual([
        'cable',
      ]);
    },
  );

  it.each(['db curl', 'dumbbells bicep curl', 'curl dumbbell'])(
    'finds the dumbbell variant with %s',
    (query) => {
      expect(progressExerciseMatches(curls, query).map((exercise) => exercise.id)).toEqual(['db']);
    },
  );

  it('finds the entire curl family without collapsing variants', () => {
    expect(progressExerciseMatches(curls, 'bicep curl')).toHaveLength(3);
  });

  it('still finds custom and imported names with singular muscles or missing equipment', () => {
    expect(
      exerciseSearchScore(
        { id: 'custom', name: 'My Bicep Curl', muscle_group: 'Other', equipment: null },
        'biceps curl',
      ),
    ).not.toBeNull();
    expect(exerciseSearchScore({ ...curls[0], equipment: null }, 'db curl')).not.toBeNull();
    expect(
      exerciseSearchScore({ ...curls[1], equipment: 'Cable stack' }, 'cable curl'),
    ).not.toBeNull();
  });

  it('never fuzzily matches an equipment word against the wrong variant', () => {
    expect(
      exerciseSearchScore(
        { id: 'x', name: 'Cable Lateral Raise', muscle_group: 'Shoulders', equipment: 'Dumbbell' },
        'cable',
      ),
    ).toBeNull();
    expect(progressExerciseMatches(curls, 'barbell curl')).toEqual([]);
    expect(progressExerciseMatches(curls, 'cable dumbbell curl')).toEqual([]);
  });

  it.each([
    ['smith machine squat', 'Smith Machine Squat', 'Smith machine'],
    ['ez-bar curl', 'EZ Bar Curl', 'EZ curl bar'],
    ['hex bar deadlift', 'Trap Bar Deadlift', 'Trap bar'],
    ['resistance bands curl', 'Band Biceps Curl', 'Resistance band'],
    ['kb squat', 'Kettlebell Goblet Squat', 'Kettlebell'],
  ])('recognises %s', (query, name, equipment) => {
    expect(
      exerciseSearchScore({ id: 'x', name, equipment, muscle_group: 'Biceps' }, query),
    ).not.toBeNull();
  });

  it('prefers a contiguous match for highlighting', () => {
    expect(fuzzyMatchIndices('Single-Arm Lat Pulldown (Machine)', 'lat')).toEqual([11, 12, 13]);
    expect(fuzzyMatchIndices('Plate Lat Pulldown', 'lat')).toEqual([6, 7, 8]);
  });

  it('matches non-adjacent letters in order', () => {
    const name = 'Single-Arm Lat Pulldown (Machine)';
    const indices = fuzzyMatchIndices(name, 'slp');
    expect(indices?.map((index) => name[index].toLocaleLowerCase()).join('')).toBe('slp');
  });

  it('matches keywords across exercise metadata regardless of keyword order', () => {
    expect(fuzzyMatchesFields(['Leg Extension', 'Quads', 'Machine'], 'machine quad')).toBe(true);
    expect(fuzzyMatchesFields(['Leg Extension', 'Quads', 'Machine'], 'cable quad')).toBe(false);
  });

  it('ranks complete words and prefixes above scattered letters', () => {
    const directScore = fuzzyScoreFields(['Dumbbell Pullover', 'Lats', 'Dumbbell'], 'lat pu');
    const scatteredScore = fuzzyScoreFields(
      ['Bulgarian Split Squat', 'Quads', 'Dumbbell'],
      'lat pu',
    );

    expect(directScore).not.toBeNull();
    expect(scatteredScore).not.toBeNull();
    expect(directScore!).toBeLessThan(scatteredScore!);
  });

  it('does not match letters in the wrong order', () => {
    expect(fuzzyMatchIndices('Lat', 'tal')).toBeNull();
  });

  it('returns every matching character to render in bold', () => {
    expect(fuzzyHighlightIndices('Chest Supported Row', 'ch row')).toEqual([0, 1, 16, 17, 18]);
  });

  it('ranks a recently performed matching exercise above unused matches', () => {
    const exercises = [
      { id: 'floor', name: 'Crunch', muscle_group: 'Abs', equipment: null },
      { id: 'machine', name: 'Machine Ab Crunch', muscle_group: 'Abs', equipment: 'Machine' },
      { id: 'cable', name: 'Cable Crunch', muscle_group: 'Abs', equipment: 'Cable' },
    ];

    expect(rankExerciseSearchMatches(exercises, 'crunch', ['machine'])[0].id).toBe('machine');
  });

  it('orders performed search matches from most recently used to least recently used', () => {
    const exercises = [
      { id: 'older', name: 'Cable Crunch', muscle_group: 'Abs', equipment: 'Cable' },
      { id: 'latest', name: 'Machine Ab Crunch', muscle_group: 'Abs', equipment: 'Machine' },
    ];

    expect(rankExerciseSearchMatches(exercises, 'crunch', ['latest', 'older'])).toEqual([
      exercises[1],
      exercises[0],
    ]);
  });

  it('keeps fuzzy relevance ordering when neither exercise has been performed', () => {
    const exercises = [
      {
        id: 'scattered',
        name: 'Bulgarian Split Squat',
        muscle_group: 'Quads',
        equipment: 'Dumbbell',
      },
      { id: 'direct', name: 'Dumbbell Pullover', muscle_group: 'Lats', equipment: 'Dumbbell' },
    ];

    expect(rankExerciseSearchMatches(exercises, 'lat pu', [])[0].id).toBe('direct');
  });

  it('searches progress exercises by name, muscle group, and equipment', () => {
    const exercises = [
      { id: 'press', name: 'Chest Press', muscle_group: 'Chest', equipment: 'Machine' },
      { id: 'row', name: 'Seated Row', muscle_group: 'Back', equipment: 'Cable' },
      { id: 'curl', name: 'Preacher Curl', muscle_group: 'Biceps', equipment: 'Machine' },
    ];
    expect(progressExerciseMatches(exercises, 'row').map((item) => item.id)).toEqual(['row']);
    expect(progressExerciseMatches(exercises, 'back').map((item) => item.id)).toEqual(['row']);
    expect(progressExerciseMatches(exercises, 'cable').map((item) => item.id)).toEqual(['row']);
    expect(progressExerciseMatches(exercises, 'machine chest').map((item) => item.id)).toEqual([
      'press',
    ]);
  });

  it('shows the full progress exercise list alphabetically when browsing', () => {
    const exercises = [
      { id: 'z', name: 'Z Press', muscle_group: 'Shoulders', equipment: 'Barbell' },
      { id: 'a', name: 'Arnold Press', muscle_group: 'Shoulders', equipment: 'Dumbbell' },
    ];
    expect(progressExerciseMatches(exercises, '').map((item) => item.id)).toEqual(['a', 'z']);
    expect(progressExerciseMatches(exercises, 'no match')).toEqual([]);
  });
});
