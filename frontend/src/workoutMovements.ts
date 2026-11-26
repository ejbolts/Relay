import { isRepRange } from './repProgression';
import type { Exercise, MachineSetting, RepRange, TrackedWorkout, WorkoutSetInput } from './types';
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
  /** Target reps from the plan this exercise came from. */
  repRange?: RepRange;
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
    ...(isRepRange(movement.repRange) && { repRange: movement.repRange }),
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

/**
 * A saved workout's exercises and sets as editable rows, for editing it or resuming it. Every
 * saved field is carried, so a save sends back everything it loaded. `newKey` makes row keys
 * (crypto.randomUUID on the web).
 */
export function savedWorkoutMovements(
  workout: TrackedWorkout,
  newKey: () => string,
): WorkoutDraftMovement[] {
  return workout.movements.map((movement) => ({
    key: newKey(),
    exercise: movement.exercise,
    notes: movement.notes ?? '',
    machinePhotoIds: movement.machine_photos.map((photo) => photo.id),
    machinePhotosInitialized: true,
    machineSettings: movement.machine_settings ?? [],
    supersetKey: movement.superset_group_id,
    isComplete: false,
    sets: movement.sets.map((item) => ({
      key: newKey(),
      reps: item.reps,
      machine_photo_id: item.machine_photo_id,
      weight_kg: item.weight_kg,
      rpe: item.rpe,
      rest_seconds: item.rest_seconds,
      duration_seconds: item.duration_seconds,
      distance_km: item.distance_km,
      calories_kcal: item.calories_kcal,
      average_heart_rate_bpm: item.average_heart_rate_bpm,
      incline_percent: item.incline_percent,
      speed_kph: item.speed_kph,
      bodyweight_kg: item.bodyweight_kg,
      percentile: item.percentile,
      warmup: item.warmup,
      set_type: item.set_type,
      failed: item.failed,
      target_reps: item.target_reps,
      notes: item.notes,
      completed: item.completed,
      // Saved rows have no suggestion provenance. Keep unfinished performance planned
      // when resuming; logging or editing its values will mark it as entered.
      fromPrevious: !item.completed,
    })),
  }));
}
