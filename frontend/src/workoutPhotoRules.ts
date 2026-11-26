import type { WorkoutPhoto } from './types';

// A saved workout's photos: how many it can hold and what the photo viewer says, shared by the
// web and the app.

/** The most photos one workout can hold; the server enforces the same number. */
export const MAX_WORKOUT_PHOTOS = 3;

/** Whether another photo can be added. */
export function canAddWorkoutPhoto(photos: readonly WorkoutPhoto[]): boolean {
  return photos.length < MAX_WORKOUT_PHOTOS;
}

/** The photo viewer's title. */
export function workoutPhotoTitle(position: number, count: number): string {
  return count > 1 ? `Photo ${position + 1} of ${count}` : 'Workout photo';
}

/** A photo's spoken name in a workout's row of photos. */
export function workoutPhotoLabel(position: number, count: number, subject: string): string {
  return `View photo ${position + 1} of ${count} of ${subject}`;
}

/** Shown in the viewer when a photo can't be loaded. */
export const PHOTO_UNAVAILABLE = 'This photo could not be loaded. Close and try again.';
