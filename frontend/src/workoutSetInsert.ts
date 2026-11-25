import type { WorkoutDraftMovement } from './workoutMovements';
import { emptyDraftSet } from './workoutStartMovements';

/**
 * The exercise with a set added at `position` (the end by default), copying the set above it, or
 * set 1 when it goes at the start. A set slotted in with "+" keeps its neighbour's rest hidden,
 * like a suggested set, until it is ticked; only Add set at the end shows its rest straight away.
 */
export function movementWithAddedSet(
  movement: WorkoutDraftMovement,
  defaultRest: number | null,
  key: string,
  position?: number,
): WorkoutDraftMovement {
  const at = Math.min(Math.max(position ?? movement.sets.length, 0), movement.sets.length);
  const added = emptyDraftSet(
    movement.exercise.kind,
    movement.sets[at === 0 ? 0 : at - 1],
    defaultRest,
    key,
  );
  if (position !== undefined) added.restRevealed = false;
  return {
    ...movement,
    isComplete: false,
    sets: [...movement.sets.slice(0, at), added, ...movement.sets.slice(at)],
  };
}
