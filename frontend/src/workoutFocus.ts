import { useSyncExternalStore } from 'react';
import {
  currentWorkoutFocus,
  subscribeWorkoutFocus,
  type WorkoutFocus,
} from './workoutFocusRequest';

// The request store is shared with the app (see workoutFocusRequest.ts); this adds the web's hook.
export {
  clearWorkoutFocus,
  onWorkoutFocusRequested,
  requestWorkoutFocus,
  type WorkoutFocus,
} from './workoutFocusRequest';

/** No request can be waiting while the page is first rendered on the server. */
const serverSnapshot = () => null;

/** The waiting request, if any. */
export function useWorkoutFocus(): WorkoutFocus | null {
  return useSyncExternalStore(subscribeWorkoutFocus, currentWorkoutFocus, serverSnapshot);
}
