import type { Exercise, MachineSetting, WorkoutSetInput } from './types';
import type { ExerciseMachineChoices } from './exerciseMachineChoices';
import type { StoredDraftMovement } from './workoutDraft';
import { hasUnassignedMachineSets } from './setMachines';

export type WorkoutDraftSet = WorkoutSetInput & {
  key: string;
  fromPrevious?: boolean;
  restRevealed?: boolean;
  restConfirmed?: boolean;
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
  /** The exercise this movement replaced mid-workout, shown on its card. */
  swappedFrom?: string;
  sets: WorkoutDraftSet[];
};

/** Restore a draft only when every exercise is available; never return a partial workout. */
export function restoreWorkoutDraftMovements(
  stored: StoredDraftMovement[],
  exercises: Exercise[],
): WorkoutDraftMovement[] | null {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  for (const exercise of exercises) {
    for (const id of exercise.merged_from_ids ?? []) exerciseById.set(id, exercise);
  }
  if (stored.some((movement) => !exerciseById.has(movement.exerciseId))) return null;
  return stored.map((movement) => ({
    key: movement.key,
    exercise: exerciseById.get(movement.exerciseId)!,
    notes: movement.notes,
    machinePhotoIds: movement.machinePhotoIds,
    machinePhotosInitialized: true,
    machineSettings: movement.machineSettings,
    supersetKey: movement.supersetKey,
    isComplete:
      Boolean(movement.isComplete) &&
      movement.sets.every((set) => set.completed) &&
      !hasUnassignedMachineSets(movement.machinePhotoIds, movement.sets),
    ...(typeof movement.swappedFrom === 'string' && { swappedFrom: movement.swappedFrom }),
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
          sets: movement.sets.map((set) => ({ ...set, machine_photo_id: null })),
          isComplete: false,
        }
      : movement,
  );
}

/**
 * The machine for a movement added from the exercise picker. A picked machine, or the baseline
 * exercise (`null`), is final; without a choice the logger restores the last-used machine.
 */
export function machineSelection(
  exerciseId: string,
  choices: ExerciseMachineChoices,
): Pick<WorkoutDraftMovement, 'machinePhotoIds' | 'machinePhotosInitialized' | 'machineSettings'> {
  if (!Object.hasOwn(choices, exerciseId)) {
    return { machinePhotoIds: [], machinePhotosInitialized: false, machineSettings: undefined };
  }
  const machineId = choices[exerciseId];
  return {
    machinePhotoIds: machineId ? [machineId] : [],
    machinePhotosInitialized: true,
    machineSettings: undefined,
  };
}
