import { hasUnassignedMachineSets } from './setMachines';
import type { WorkoutCategory, WorkoutInput, WorkoutSetInput, WorkoutType } from './types';
import { workoutSetForAutoSave } from './workoutAutoSave';
import { finalizeWorkoutIdentity, isCardioTypeWithoutCardio } from './workoutCategory';
import type { WorkoutDraftMovement } from './workoutMovements';
import { clockOffsetMsAt, type WorkoutPause } from './workoutPause';
import {
  cardioAdjustedEndTime,
  completedCardioDurationSeconds,
  completedWorkoutDurationMinutes,
  liveWorkoutTimes,
} from './workoutResume';
import { hasRecordedPerformance } from './workoutSets';

// Whether a workout can be saved, and exactly what saving it sends. Plain functions with no
// React or browser APIs: the web logger and the native app (mobile/) both use them, so both send
// the same WorkoutInput.

/** What the logger knows about the workout when it finishes. */
export interface WorkoutFinishState {
  movements: WorkoutDraftMovement[];
  name: string;
  category: WorkoutCategory;
  customTypeId: string | null;
  workoutTypeExplicit: boolean;
  /** The workout's type as shown, from `effectiveWorkoutType`. */
  selectedType: WorkoutType;
  /** The types the workout may be saved as. */
  typeOptions: WorkoutType[];
  types: WorkoutType[];
  typesLoading: boolean;
  /** Editing a saved workout rather than logging a live one. */
  editing: boolean;
  resumedWorkoutId: string | null;
  startedAt: number;
  previousDurationMinutes: number;
  durationOverrideMinutes: number | null;
  pause: WorkoutPause;
  /** An edit's duration and clock times; unused for a live workout. */
  editedDurationMinutes: number;
  startTime: string;
  endTime: string;
  clientSessionId: string;
  baseRevision: number | undefined;
  workoutDate: string;
  notes: string;
}

/** An exercise as it will be saved: sets ticked by an auto-save keep no draft-only fields. */
export type MovementToSave = Omit<WorkoutDraftMovement, 'sets'> & { sets: WorkoutSetInput[] };

export type WorkoutFinishCheck =
  | { kind: 'blocked'; message: string }
  | { kind: 'machines'; exercise: string }
  | {
      kind: 'ready';
      movementsToSave: MovementToSave[];
      durationMinutes: number;
      cardioDurationSeconds: number;
    };

/**
 * An explicit type keeps its identity in the live heading and the saved workout, except Cardio
 * on a workout with no cardio, which would file a strength session as cardio.
 */
export function infersWorkoutType(
  state: Pick<
    WorkoutFinishState,
    | 'editing'
    | 'resumedWorkoutId'
    | 'customTypeId'
    | 'workoutTypeExplicit'
    | 'category'
    | 'movements'
  >,
): boolean {
  return (
    !state.editing &&
    !state.resumedWorkoutId &&
    !state.customTypeId &&
    (!state.workoutTypeExplicit ||
      isCardioTypeWithoutCardio(
        state.category,
        state.movements.map((movement) => movement.exercise),
      ))
  );
}

/** The name and category the workout shows while live and saves with. */
export function liveWorkoutIdentity(
  state: Pick<
    WorkoutFinishState,
    | 'editing'
    | 'resumedWorkoutId'
    | 'customTypeId'
    | 'workoutTypeExplicit'
    | 'category'
    | 'movements'
    | 'name'
    | 'selectedType'
    | 'types'
  >,
): { category: WorkoutCategory; name: string } {
  const exercises = state.movements.map((movement) => movement.exercise);
  const identity = finalizeWorkoutIdentity(
    exercises,
    state.category,
    state.name,
    infersWorkoutType(state),
    state.customTypeId ? state.selectedType : null,
  );
  if (!state.customTypeId && state.types.find((type) => type.id === identity.category)?.archived) {
    return finalizeWorkoutIdentity(exercises, state.category, state.name, false);
  }
  return identity;
}

/** Checks whether the workout can be saved now, without saving it. */
export function checkWorkoutFinish(
  state: WorkoutFinishState,
  inactiveEndAt?: number,
  now = Date.now(),
): WorkoutFinishCheck {
  const blocked = (message: string) => ({ kind: 'blocked' as const, message });
  const { movements, editing, selectedType, customTypeId } = state;
  if (state.typesLoading) {
    return blocked('Workout types are still loading. Please try saving again in a moment.');
  }
  if (customTypeId && selectedType.id !== customTypeId) {
    return blocked(
      'Your workout type could not load. Reload workout types or choose another type.',
    );
  }
  if (!state.typeOptions.some((type) => type.id === selectedType.id)) {
    return blocked('Choose an available workout type. Add or restore types in Settings if needed.');
  }
  if (selectedType.archived && !editing && !state.resumedWorkoutId) {
    return blocked('This workout type was removed. Choose another type before saving.');
  }
  const finishedAt = inactiveEndAt ?? now;
  const movementsToSave: MovementToSave[] = movements.map((movement) => ({
    ...movement,
    sets: movement.sets.map((item) => {
      const set =
        inactiveEndAt === undefined ? item : workoutSetForAutoSave(movement.exercise.kind, item);
      // A live workout never records a ticked set with nothing in it (such as one ticked
      // before this check existed); it is kept as an unticked set instead.
      return !editing && set.completed && !hasRecordedPerformance(movement.exercise.kind, set)
        ? { ...set, completed: false }
        : set;
    }),
  }));
  const cardioDurationSeconds = completedCardioDurationSeconds(movementsToSave);
  const unassigned = movementsToSave.find((movement) =>
    hasUnassignedMachineSets(movement.machinePhotoIds, movement.sets),
  );
  if (unassigned) return { kind: 'machines', exercise: unassigned.exercise.name };
  const durationMinutes = editing
    ? Math.max(state.editedDurationMinutes, Math.ceil(cardioDurationSeconds / 60))
    : completedWorkoutDurationMinutes(
        state.previousDurationMinutes,
        state.startedAt,
        finishedAt,
        state.durationOverrideMinutes,
        clockOffsetMsAt(state.pause, finishedAt),
        cardioDurationSeconds,
      );
  const completed = movementsToSave
    .flatMap((movement) => movement.sets)
    .filter((item) => item.completed);
  if (!movements.length || !completed.length) {
    return blocked(
      !movements.length
        ? 'Your workout has no exercises yet. Add an exercise, enter a set and tap its tick to mark it complete before saving your workout.'
        : 'No sets have been marked complete. Add or fill in a set, then tap the tick beside that set or its exercise. You need at least one completed set to save your workout.',
    );
  }
  if (editing && Boolean(state.startTime) !== Boolean(state.endTime)) {
    return blocked('Enter both a workout start time and end time, or leave both blank.');
  }
  if (editing && state.startTime && state.endTime && durationMinutes === 1440) {
    return blocked('Clear the start and end times to save a 24-hour workout.');
  }
  if (durationMinutes > 1440) {
    return blocked(
      cardioDurationSeconds > 1440 * 60
        ? 'Logged cardio exceeds 24 hours. Correct the cardio durations before saving.'
        : 'The total workout duration is over 24 hours. Enter the actual total duration below before saving.',
    );
  }
  return { kind: 'ready', movementsToSave, durationMinutes, cardioDurationSeconds };
}

/** The workout a ready check saves, without the shared-draft fields added when finishing. */
export function finishedWorkoutInput(
  state: WorkoutFinishState,
  {
    movementsToSave,
    durationMinutes,
    cardioDurationSeconds,
  }: Extract<WorkoutFinishCheck, { kind: 'ready' }>,
): WorkoutInput {
  const { editing, resumedWorkoutId, startTime, endTime, baseRevision } = state;
  const identity = liveWorkoutIdentity(state);
  const liveTimes =
    !editing && !resumedWorkoutId ? liveWorkoutTimes(state.startedAt, durationMinutes) : null;
  return {
    ...(!editing && !resumedWorkoutId && { client_session_id: state.clientSessionId }),
    ...((editing || resumedWorkoutId) &&
      baseRevision !== undefined && { base_revision: baseRevision }),
    name: identity.name,
    workout_date: state.workoutDate,
    category: identity.category,
    workout_type_id: state.customTypeId,
    notes: state.notes.trim() || null,
    duration_minutes: durationMinutes,
    // A new live workout records when it started and ended; edits keep their own times.
    start_time: editing && startTime && endTime ? startTime : (liveTimes?.start ?? null),
    end_time:
      editing && startTime && endTime
        ? cardioAdjustedEndTime(startTime, endTime, cardioDurationSeconds)
        : (liveTimes?.end ?? null),
    movements: movementsToSave.map((movement) => ({
      exercise_id: movement.exercise.id,
      notes: movement.notes.trim() || null,
      machine_photo_ids: movement.machinePhotoIds,
      machine_settings: movement.machineSettings ?? [],
      sets: movement.sets.map((item) => ({
        reps: item.reps,
        machine_photo_id:
          item.machine_photo_id ??
          (movement.machinePhotoIds.length === 1 ? movement.machinePhotoIds[0] : null),
        weight_kg: item.weight_kg,
        rpe: item.rpe,
        rest_seconds: item.rest_seconds,
        duration_seconds: item.duration_seconds,
        distance_km: item.distance_km,
        calories_kcal: item.calories_kcal,
        average_heart_rate_bpm: item.average_heart_rate_bpm,
        incline_percent: item.incline_percent ?? null,
        speed_kph: item.speed_kph ?? null,
        bodyweight_kg: item.bodyweight_kg,
        percentile: item.percentile,
        warmup: item.warmup,
        set_type: item.set_type,
        failed: item.failed,
        target_reps: item.target_reps,
        notes: item.notes,
        completed: item.completed,
      })),
      superset_key: movement.supersetKey,
    })),
  };
}
