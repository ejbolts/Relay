import { hasUnassignedMachineSets } from './setMachines';
import { workoutSetAfterEdit } from './workoutAutoSave';
import type { WorkoutDraftMovement, WorkoutDraftSet } from './workoutMovements';
import { restTimerSecondsAfterSetUpdate, suggestNextSetFromLoggedSet } from './workoutSets';

// What editing or ticking one set does to its exercise in a live workout. Plain functions with
// no React or browser APIs: the web logger and the native app (mobile/) both use them.

export interface SetUpdateEffects {
  /** The update ticks a set that was not logged yet. */
  loggingSet: boolean;
  /** Ticking the last open set finishes the exercise (not when editing a saved workout). */
  finishesExercise: boolean;
  /** The weight or reps of an already logged set change. */
  correctingLoggedSet: boolean;
  /** The rest to count down after this update, or null for none. */
  restSeconds: number | null;
}

export function setUpdateEffects(
  movement: WorkoutDraftMovement | undefined,
  setKey: string,
  update: Partial<WorkoutDraftSet>,
  editingSavedWorkout: boolean,
): SetUpdateEffects {
  const currentSet = movement?.sets.find((item) => item.key === setKey);
  const loggingSet = update.completed === true && currentSet?.completed === false;
  return {
    loggingSet,
    finishesExercise:
      loggingSet &&
      !!movement &&
      !editingSavedWorkout &&
      movement.sets.every((item) => item.key === setKey || item.completed),
    correctingLoggedSet:
      currentSet?.completed === true &&
      (update.weight_kg !== undefined || update.reps !== undefined),
    restSeconds:
      movement && currentSet
        ? restTimerSecondsAfterSetUpdate(movement.exercise.kind, currentSet, update)
        : null,
  };
}

/**
 * The exercise after `update` is applied to one of its sets: a ticked strength set records the
 * day's bodyweight, ticking the last open set folds a planned exercise away (a set added by hand
 * keeps it open), and logging or correcting a set moves the untouched suggestion after it.
 */
export function movementAfterSetUpdate(
  movement: WorkoutDraftMovement,
  setKey: string,
  update: Partial<WorkoutDraftSet>,
  {
    finishesExercise,
    suggestNext,
    addedByHand,
    workoutBodyweight,
  }: {
    finishesExercise: boolean;
    /** Logging or correcting a set: the next untouched suggestion repeats it. */
    suggestNext: boolean;
    /** The set was added with Add set in this session. */
    addedByHand: boolean;
    workoutBodyweight: number | null;
  },
): WorkoutDraftMovement {
  const sets = movement.sets.map((item) =>
    item.key === setKey
      ? workoutSetAfterEdit(item, {
          restRevealed: item.completed || (item.restRevealed ?? !item.fromPrevious),
          ...update,
          ...(update.completed === true && {
            restRevealed: true,
            ...(movement.exercise.kind === 'strength' && {
              bodyweight_kg: item.bodyweight_kg ?? workoutBodyweight,
            }),
          }),
          ...(update.rest_seconds !== undefined && { restConfirmed: true }),
        })
      : item,
  );
  return {
    ...movement,
    isComplete:
      (movement.isComplete || (finishesExercise && sets.length > 1 && !addedByHand)) &&
      sets.every((set) => set.completed) &&
      !hasUnassignedMachineSets(movement.machinePhotoIds, sets),
    sets: suggestNext
      ? suggestNextSetFromLoggedSet(
          movement.exercise.kind,
          sets,
          sets.findIndex((item) => item.key === setKey),
        )
      : sets,
  };
}
