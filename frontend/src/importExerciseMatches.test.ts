import { expect, it } from 'vitest';
import { bestExerciseMatches } from './importExerciseMatches';

const exercises = [
  'Back Extension Machine',
  'Back Squat',
  'Barbell Bench Press',
  'Band Biceps Curl',
  'Dumbbell Bench Press',
  'Front Squat',
  'Machine Chest Press',
].map((name, index) => ({ id: String(index), name }));

it('lists the closest names first, preferring names that share more words', () => {
  const names = (incoming: string) =>
    bestExerciseMatches(incoming, exercises).map((exercise) => exercise.name);
  expect(names('Bench press (paused)').slice(0, 2)).toEqual([
    'Barbell Bench Press',
    'Dumbbell Bench Press',
  ]);
  expect(names('Zercher Squatz').slice(0, 2)).toEqual(['Back Squat', 'Front Squat']);
  expect(bestExerciseMatches('Bench press', exercises, 1)).toHaveLength(1);
  expect(bestExerciseMatches('', exercises)).toEqual([]);
});
