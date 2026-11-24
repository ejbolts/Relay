import { captureWorkoutLink } from '../features/workout/workoutLink';
import { captureFriendInvite } from '../session/friendInvite';

/** Remember system invites before protected routes send a signed-out visitor to Sign in. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  captureFriendInvite(path);
  // A tap on the rest timer's Live Activity before the logger's route can open.
  captureWorkoutLink(path);
  return path;
}
