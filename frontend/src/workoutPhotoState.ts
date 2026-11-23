import { useState } from 'react';
import type { TrackedWorkout, WorkoutPhoto } from './types';

export { MAX_WORKOUT_PHOTOS } from './workoutPhotoRules';

/**
 * A saved workout's photos, updated on screen the moment one is added or removed, until the
 * refreshed workout arrives with the same change.
 */
export function useWorkoutPhotos(
  workout: Pick<TrackedWorkout, 'photos'>,
): [WorkoutPhoto[], (photos: WorkoutPhoto[]) => void] {
  const saved = workout.photos ?? [];
  const signature = saved.map((photo) => photo.id).join(',');
  const [edited, setEdited] = useState<{ from: string; photos: WorkoutPhoto[] } | null>(null);
  return [
    edited && edited.from === signature ? edited.photos : saved,
    (photos) => setEdited({ from: signature, photos }),
  ];
}
