import type { Exercise, MachineSetting, WorkoutSetInput } from './types';
import type { StoredDraftMovement } from './workoutDraft';

export type WorkoutDraftSet = WorkoutSetInput & {
  key: string;
  fromPrevious?: boolean;
};

export type WorkoutDraftMovement = {
  key: string;
  exercise: Exercise;
  notes: string;
  machinePhotoIds: string[];
  machinePhotosInitialized: boolean;
  machineSettings?: MachineSetting[];
  supersetKey: string | null;
  isComplete: boolean;
  sets: WorkoutDraftSet[];
};

/** Restore a draft only when every exercise is available; never return a partial workout. */
export function restoreWorkoutDraftMovements(
  stored: StoredDraftMovement[],
  exercises: Exercise[],
): WorkoutDraftMovement[] | null {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  if (stored.some((movement) => !exerciseById.has(movement.exerciseId))) return null;
  return stored.map((movement) => ({
    key: movement.key,
    exercise: exerciseById.get(movement.exerciseId)!,
    notes: movement.notes,
    machinePhotoIds: movement.machinePhotoIds,
    machinePhotosInitialized: true,
    machineSettings: movement.machineSettings,
    supersetKey: movement.supersetKey,
    isComplete: movement.isComplete ?? false,
    sets: movement.sets,
  }));
}

export function replaceMovementExercise(
  movements: WorkoutDraftMovement[],
  movementKey: string,
  exercise: Exercise,
): WorkoutDraftMovement[] {
  return movements.map((movement) =>
    movement.key === movementKey
      ? {
          ...movement,
          exercise,
          machinePhotoIds: [],
          machinePhotosInitialized: false,
          machineSettings: undefined,
          isComplete: false,
        }
      : movement,
  );
}
