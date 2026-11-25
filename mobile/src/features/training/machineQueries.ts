import { useQuery } from '@tanstack/react-query';
import type { TrackedWorkout } from '../../../../frontend/src/types';
import { apiGet } from '../../data/api';

/**
 * Every saved workout that pinned a machine, newest first, read from the server as the web's
 * machine filter reads it, so a machine last used long ago is found even when that history isn't
 * loaded. The key sits under `workouts`, so a saved or edited workout refreshes it.
 */
export const machineWorkoutsKey = (photoId: string) =>
  ['workouts', 'machine-photo', photoId] as const;

export function useMachineWorkouts(photoId: string) {
  return useQuery({
    queryKey: machineWorkoutsKey(photoId),
    enabled: !!photoId,
    queryFn: ({ signal }) =>
      apiGet<TrackedWorkout[]>(
        `/api/machine-photos/${encodeURIComponent(photoId)}/workouts`,
        signal,
      ),
  });
}
