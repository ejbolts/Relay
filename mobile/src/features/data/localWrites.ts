import { readFinishedWorkouts } from '../../../../frontend/src/finishedWorkoutQueue';
import { deviceStorage } from '../../data/deviceStorage';
import { useUser } from '../../session/SessionProvider';
import { useWorkout } from '../workout/WorkoutProvider';

// A restore or an undo removes or replaces saved workouts on the server, while this phone may
// still hold writes it has not sent: the workout in progress (which syncs as it changes) and
// finished workouts waiting in the queue. Sent afterwards, a write could overwrite the restored
// workout with the revision it was based on, or point at a workout the undo deleted. So both
// wait until those writes are settled. (The web keeps no such guard; a server-side restore
// generation would cover writes from other devices too.)

export interface LocalWorkoutWrites {
  /** A workout is in progress on this phone. */
  live: boolean;
  /** The workout in progress reopens a saved workout. */
  editingSaved: boolean;
  /** Finished workouts on this phone the server has not confirmed, including refused ones. */
  unsent: number;
  /** Of those, changes to saved workouts rather than new workouts. */
  unsentEdits: number;
}

export function useLocalWorkoutWrites(): LocalWorkoutWrites {
  const user = useUser();
  const { live, queue } = useWorkout();
  const mine = readFinishedWorkouts(deviceStorage).filter(
    (item) => item.pendingSave.userId === user.id,
  );
  return {
    live: !!live,
    editingSaved: !!live?.resumedWorkoutId,
    unsent: Math.max(queue.waiting, mine.length),
    unsentEdits: mine.filter((item) => item.pendingSave.workoutId).length,
  };
}

const unsynced = (count: number) =>
  count === 1
    ? '1 finished workout on this phone hasn’t synced yet'
    : `${count} finished workouts on this phone haven’t synced yet`;

/** Why a restore must wait, or null when nothing on this phone could overwrite it. */
export function restoreBlocker(writes: LocalWorkoutWrites): string | null {
  if (writes.live)
    return 'Finish or discard the workout in progress before restoring a backup, so it can’t overwrite what the backup puts back.';
  if (writes.unsent)
    return `${unsynced(writes.unsent)}. Restore once they have (or discard any that can’t be saved), so they can’t overwrite the backup.`;
  return null;
}

/**
 * Why undoing an import must wait, or null. Batches don't list their workouts, so any unsent
 * change to a saved workout holds the undo, in case that workout came from the import.
 */
export function undoBlocker(writes: LocalWorkoutWrites): string | null {
  if (writes.editingSaved)
    return 'Finish or discard the saved workout you’re editing before undoing an import; it may be one this undo deletes.';
  if (writes.unsentEdits)
    return 'Changes to a saved workout on this phone haven’t synced yet. Undo the import once they have; that workout may be one this undo deletes.';
  return null;
}
