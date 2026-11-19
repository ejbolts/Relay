import { describe, expect, it } from 'vitest';
import {
  fuzzyHighlightIndices,
  fuzzyMatchIndices,
  fuzzyMatchesFields,
  fuzzyScoreFields,
  exerciseSearchAllowsTypos,
  exerciseSearchScore,
  progressExerciseMatches,
  rankExerciseSearchMatches,
  similarExercises,
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

  it('finds exercises typed with a mistake only when nothing matches as typed', () => {
    const exercises = [
      { id: 'bench', name: 'Barbell Bench Press', muscle_group: 'Chest', equipment: 'Barbell' },
      { id: 'pushdown', name: 'Triceps Pushdown', muscle_group: 'Triceps', equipment: 'Cable' },
      { id: 'pulldown', name: 'Lat Pulldown', muscle_group: 'Lats', equipment: 'Cable' },
      { id: 'raise', name: 'Full Can Raise', muscle_group: 'Shoulders', equipment: 'Dumbbell' },
    ];
    const ids = (query: string) =>
      rankExerciseSearchMatches(exercises, query, []).map((exercise) => exercise.id);
    expect(ids('bemch press')).toEqual(['bench']);
    expect(ids('tricepps')).toEqual(['pushdown']);
    expect(ids('pull')).toEqual(['pulldown']);
    expect(exerciseSearchAllowsTypos(exercises, 'pull')).toBe(false);
    expect(exerciseSearchScore(exercises[0], 'bemch')).toBeNull();
    expect(exerciseSearchScore(exercises[0], 'bemch', true)).not.toBeNull();
    expect(fuzzyHighlightIndices('Barbell Bench Press', 'bemch')).toEqual([8, 9, 10, 11, 12]);
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

  it('lists exercises named by the search before recent ones matching only a muscle', () => {
    const exercises = [
      { id: 'bench', name: 'Barbell Bench Press', muscle_group: 'Chest', equipment: 'Barbell' },
      {
        id: 'incline',
        name: 'Incline Dumbbell Press',
        muscle_group: 'Chest',
        equipment: 'Dumbbell',
      },
      { id: 'machine', name: 'Machine Chest Press', muscle_group: 'Chest', equipment: 'Machine' },
    ];

    expect(
      rankExerciseSearchMatches(exercises, 'chest press', ['bench', 'incline', 'machine']).map(
        (exercise) => exercise.id,
      ),
    ).toEqual(['machine', 'bench', 'incline']);
  });

  it('keeps recency among exercises that all contain the searched words', () => {
    const exercises = [
      { id: 'lat', name: 'Lat Pulldown', muscle_group: 'Lats', equipment: 'Cable' },
      {
        id: 'single',
        name: 'Single-Arm Cable Lat Pulldown',
        muscle_group: 'Lats',
        equipment: 'Cable',
      },
    ];

    expect(
      rankExerciseSearchMatches(exercises, 'cable lat pulldown', ['lat', 'single']).map(
        (exercise) => exercise.id,
      ),
    ).toEqual(['lat', 'single']);
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

describe('existing exercises like a new name', () => {
  const library = [
    { id: 'db-bench', name: 'Dumbbell Bench Press' },
    { id: 'bb-bench', name: 'Barbell Bench Press' },
    { id: 'incline', name: 'Incline Dumbbell Bench Press' },
    { id: 'short', name: 'DB Bench' },
    { id: 'squat', name: 'Back Squat' },
    { id: 'curl', name: 'Hammer Curl' },
  ];
  const ids = (name: string) => similarExercises(library, name).map((item) => item.id);

  it('finds near-duplicates through abbreviations, closest first, three at most', () => {
    expect(ids('DB Bench')).toEqual(['short', 'db-bench', 'incline']);
    expect(ids('Dumbbell bench')[0]).toBe('db-bench');
    expect(ids('Dumbbell bench')).toEqual(expect.arrayContaining(['short', 'incline']));
    expect(ids('bench press')).toHaveLength(3);
  });

  it('puts an exact name first whatever its case or spacing', () => {
    expect(ids('  dumbbell bench press ')[0]).toBe('db-bench');
  });

  it('allows one loosely typed word among exact ones', () => {
    expect(ids('Dumbell Bench Press')).toContain('db-bench');
  });

  it('suggests nothing for a new name or one too short to judge', () => {
    expect(ids('Zercher Squat')).toEqual([]);
    expect(ids('Sissy curl machine')).toEqual([]);
    expect(ids('ba')).toEqual([]);
  });
});
