import { expect, it } from 'vitest';
import { workoutCardSvg } from './workoutCardDrawing';
import type { TrackedWorkout, WorkoutPhoto } from './types';
import {
  canAddWorkoutPhoto,
  MAX_WORKOUT_PHOTOS,
  workoutPhotoLabel,
  workoutPhotoTitle,
} from './workoutPhotoRules';

const photo = (id: string) => ({ id }) as WorkoutPhoto;

it('allows photos up to the server limit and names them for the viewer', () => {
  expect(MAX_WORKOUT_PHOTOS).toBe(3);
  expect(canAddWorkoutPhoto([photo('a'), photo('b')])).toBe(true);
  expect(canAddWorkoutPhoto([photo('a'), photo('b'), photo('c')])).toBe(false);
  expect(workoutPhotoTitle(1, 3)).toBe('Photo 2 of 3');
  expect(workoutPhotoTitle(0, 1)).toBe('Workout photo');
  expect(workoutPhotoLabel(0, 2, 'Your Push')).toBe('View photo 1 of 2 of Your Push');
});

it('draws the share card with the logo each app supplies', () => {
  const workout = {
    id: 'w1',
    name: 'Push',
    workout_date: '2026-11-14',
    category: 'push',
    duration_minutes: 45,
    movements: [],
  } as unknown as TrackedWorkout;
  const svg = workoutCardSvg({
    workout,
    stats: [],
    style: 'paper',
    showDate: false,
    layout: 'compact',
    logo: 'file:///cache/logo.png?a=1&b=2',
  });
  expect(svg).toContain('href="file:///cache/logo.png?a=1&amp;b=2"');
  expect(svg).toContain('viewBox="0 0 1080 ');
});
