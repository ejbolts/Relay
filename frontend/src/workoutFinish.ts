import { withFullRepsCounted } from './extraReps';
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
      /** When the workout finished: now, or the last activity of one left running. */
      finishedAt: number;
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

/** Checks set metric bounds against the server's limits so finish errors name the exact field. */
function invalidSetFieldMessage(movements: WorkoutDraftMovement[]): string | null {
  for (const movement of movements) {
    for (let index = 0; index < movement.sets.length; index += 1) {
      const set = movement.sets[index];
      const where = `${movement.exercise.name}, set ${index + 1}`;
      const checkRange = (
        value: number | null | undefined,
        min: number,
        max: number,
        label: string,
        unit = '',
        integer = false,
      ): string | null => {
        if (value == null) return null;
        if (
          !Number.isFinite(value) ||
          value < min ||
          value > max ||
          (integer && !Number.isInteger(value))
        ) {
          const shown = Number.isFinite(value) ? ` (${value}${unit})` : '';
          const kind = integer ? 'a whole number ' : '';
          return `${where}: ${label}${shown} must be ${kind}between ${min.toLocaleString('en-US')} and ${max.toLocaleString('en-US')}${unit}.`;
        }
        return null;
      };
      const error =
        checkRange(set.average_heart_rate_bpm, 20, 250, 'average heart rate', ' bpm', true) ??
        checkRange(set.speed_kph, 0, 100, 'speed', ' km/h') ??
        checkRange(set.incline_percent, 0, 100, 'incline', '%') ??
        (set.duration_seconds != null &&
        (!Number.isFinite(set.duration_seconds) ||
          !Number.isInteger(set.duration_seconds) ||
          set.duration_seconds < 0 ||
          set.duration_seconds > 172_800)
          ? `${where}: duration must be between 0 and 48 hours.`
          : null) ??
        checkRange(set.distance_km, 0, 10_000, 'distance', ' km') ??
        checkRange(set.calories_kcal, 0, 100_000, 'calories', ' kcal', true) ??
        checkRange(set.reps, 0, 10_000, 'reps', '', true) ??
        checkRange(set.partial_reps, 0, 10_000, 'partial reps', '', true) ??
        checkRange(set.assisted_reps, 0, 10_000, 'assisted reps', '', true) ??
        checkRange(set.weight_kg, 0, 10_000, 'weight', ' kg') ??
        checkRange(set.rpe, 1, 10, 'RPE') ??
        (set.rest_seconds != null &&
        (!Number.isFinite(set.rest_seconds) ||
          !Number.isInteger(set.rest_seconds) ||
          set.rest_seconds < 0 ||
          set.rest_seconds > 7_200)
          ? `${where}: rest must be between 0 and 120 minutes.`
          : null) ??
        checkRange(set.bodyweight_kg, 0, 1_000, 'bodyweight', ' kg') ??
        checkRange(set.percentile, 0, 100, 'percentile', '%') ??
        checkRange(set.target_reps, 0, 10_000, 'target reps', '', true);
      if (error) return error;
    }
  }
  return null;
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
        : withFullRepsCounted(movement.exercise.kind, set);
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
  const invalidSet = invalidSetFieldMessage(movements);
  if (invalidSet) return blocked(invalidSet);
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
  return { kind: 'ready', movementsToSave, durationMinutes, cardioDurationSeconds, finishedAt };
}

/** The workout a ready check saves, without the shared-draft fields added when finishing. */
export function finishedWorkoutInput(
  state: WorkoutFinishState,
  {
    movementsToSave,
    durationMinutes,
    cardioDurationSeconds,
    finishedAt,
  }: Extract<WorkoutFinishCheck, { kind: 'ready' }>,
): WorkoutInput {
  const { editing, resumedWorkoutId, startTime, endTime, baseRevision } = state;
  const identity = liveWorkoutIdentity(state);
  const liveTimes =
    !editing && !resumedWorkoutId
      ? liveWorkoutTimes(finishedAt, durationMinutes, state.workoutDate)
      : null;
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
        // Always sent, even when empty: it tells the server this app knows these fields, so
        // clearing one is kept (an older app leaves them out and the saved values stay).
        partial_reps: item.partial_reps ?? null,
        assisted_reps: item.assisted_reps ?? null,
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
