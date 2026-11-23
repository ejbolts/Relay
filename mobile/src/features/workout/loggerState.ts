import {
  extendInactiveWorkoutFinishAt,
  inactiveWorkoutFinishAt,
} from '../../../../frontend/src/activeWorkoutTimeout';
import { setKindUpdate, type SetKind } from '../../../../frontend/src/setFieldValues';
import type { SessionTemplate } from '../../../../frontend/src/trainingSummary';
import type {
  Exercise,
  ExerciseHistoryBaseline,
  TrackedWorkout,
  WorkoutCategory,
  WorkoutType,
} from '../../../../frontend/src/types';
import { mergeUniqueById, reorder } from '../../../../frontend/src/utils';
import { workoutNameForCategory } from '../../../../frontend/src/workoutCategory';
import type { WeightUnit } from '../../../../frontend/src/weightUnits';
import type { ActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import {
  checkWorkoutFinish,
  finishedWorkoutInput,
  liveWorkoutIdentity,
  type WorkoutFinishCheck,
  type WorkoutFinishState,
} from '../../../../frontend/src/workoutFinish';
import {
  machineSelection,
  restoreWorkoutDraftMovements,
  type WorkoutDraftMovement,
  type WorkoutDraftSet,
} from '../../../../frontend/src/workoutMovements';
import {
  draftPause,
  pauseWorkout,
  resumeWorkout,
  RUNNING,
  type WorkoutPause,
} from '../../../../frontend/src/workoutPause';
import {
  movementAfterSetUpdate,
  setUpdateEffects,
} from '../../../../frontend/src/workoutSetUpdate';
import {
  completeRemainingSets,
  hasRecordedPerformance,
} from '../../../../frontend/src/workoutSets';
import {
  emptyDraftSet,
  suggestedSetsFromHistory,
  templateDraftMovements,
} from '../../../../frontend/src/workoutStartMovements';
import {
  applySupersetSelection,
  clearSuperset,
  keepSupersetTogether,
  nextInSupersetRound,
} from '../../../../frontend/src/workoutSupersets';
import { effectiveWorkoutType } from '../../../../frontend/src/workoutTypes';

/**
 * The live workout as the logger works on it: the web's ActiveWorkoutDraft with each exercise
 * resolved, so the web's own rules (frontend/src) can run on it unchanged. Every change is
 * written back in the draft format (`loggerToDraft`), so a killed app restores it exactly.
 */
export interface LoggerState {
  clientSessionId: string;
  startedAt: number;
  lastActiveAt: number;
  inactiveFinishAt: number;
  durationOverrideMinutes: number | null;
  pause: WorkoutPause;
  name: string;
  workoutDate: string;
  category: WorkoutCategory;
  workoutTypeId: string | null;
  workoutTypeExplicit: boolean;
  skipHighRepWarning: boolean;
  notes: string;
  movements: WorkoutDraftMovement[];
}

/** Account data the logger's rules read. */
export interface LoggerContext {
  /** Recent saved workouts, for last-session suggestions. */
  workouts: TrackedWorkout[];
  /** Each exercise's history before `workouts`, condensed by the server; null without any. */
  historyBaselines?: {
    before: string;
    byExercise: Map<string, ExerciseHistoryBaseline>;
  } | null;
  weightUnit: WeightUnit;
  defaultRest: number | null;
  newKey: () => string;
}

export interface StartOptions {
  template: SessionTemplate | null;
  /** A type chosen before starting, such as Cardio from the Start menu. */
  startCategory: WorkoutCategory | null;
  startType: WorkoutType | null;
  /** Today's recommended category, which an empty workout starts as. */
  recommendationCategory: WorkoutCategory | null;
  types: WorkoutType[];
  date: string;
  now: number;
  clientSessionId: string;
}

/** A new live workout, set up as the web logger sets one up. */
export function startLogger(options: StartOptions, context: LoggerContext): LoggerState {
  const { template, startCategory, startType, now } = options;
  let category: WorkoutCategory =
    startCategory ?? template?.category ?? options.recommendationCategory ?? 'push';
  let workoutTypeId =
    (startType?.is_custom ? startType.id : null) ?? template?.sourceWorkout.workout_type_id ?? null;
  const workoutTypeExplicit = Boolean(workoutTypeId || startCategory);
  // A removed type is never started; the first type still in use takes its place.
  const selected = effectiveWorkoutType(
    {
      category,
      workout_type_id: workoutTypeId,
      workout_type: template?.sourceWorkout.workout_type,
    },
    options.types,
  );
  if (!workoutTypeExplicit && selected.archived) {
    const first = options.types.find((type) => !type.archived);
    if (first) {
      category = first.is_custom ? 'other' : (first.id as WorkoutCategory);
      workoutTypeId = first.is_custom ? first.id : null;
    }
  }
  return {
    clientSessionId: options.clientSessionId,
    startedAt: now,
    lastActiveAt: now,
    inactiveFinishAt: inactiveWorkoutFinishAt(now, now),
    durationOverrideMinutes: null,
    pause: RUNNING,
    name: '',
    workoutDate: options.date,
    category,
    workoutTypeId,
    workoutTypeExplicit,
    skipHighRepWarning: false,
    notes: '',
    movements: templateDraftMovements(template?.exercises ?? [], {
      workouts: context.workouts,
      historyBaselines: context.historyBaselines,
      date: options.date,
      weightUnit: context.weightUnit,
      defaultRest: context.defaultRest,
      newKey: context.newKey,
    }),
  };
}

/** The draft to store for `state`, in the web's ActiveWorkoutDraft format. */
export function loggerToDraft(state: LoggerState, now: number): ActiveWorkoutDraft {
  return {
    version: 1,
    clientSessionId: state.clientSessionId,
    startedAt: state.startedAt,
    updatedAt: now,
    lastActiveAt: state.lastActiveAt,
    inactiveFinishAt: state.inactiveFinishAt,
    durationOverrideMinutes: state.durationOverrideMinutes,
    pausedMs: state.pause.pausedMs,
    ...(state.pause.adjustedMs !== undefined && {
      adjustedMs: state.pause.adjustedMs,
    }),
    pausedAt: state.pause.pausedAt,
    name: state.name,
    workoutDate: state.workoutDate,
    category: state.category,
    workoutTypeId: state.workoutTypeId,
    workoutTypeExplicit: state.workoutTypeExplicit,
    skipHighRepWarning: state.skipHighRepWarning,
    notes: state.notes,
    movements: state.movements.map((movement) => ({
      key: movement.key,
      exerciseId: movement.exercise.id,
      notes: movement.notes,
      machinePhotoIds: movement.machinePhotoIds,
      machineSettings: movement.machineSettings,
      supersetKey: movement.supersetKey,
      isComplete: movement.isComplete,
      ...(movement.swappedFrom && { swappedFrom: movement.swappedFrom }),
      ...(movement.repRange && { repRange: movement.repRange }),
      sets: movement.sets,
    })),
  };
}

/**
 * The live workout from a stored draft, or null when the draft belongs to a saved workout being
 * resumed (not supported here yet) or names an exercise the phone does not know.
 */
export function loggerFromDraft(
  draft: ActiveWorkoutDraft,
  exercises: Exercise[],
): LoggerState | null {
  if (!draft.clientSessionId || draft.resumingWorkoutId || draft.pendingSave) return null;
  const movements = restoreWorkoutDraftMovements(draft.movements, exercises);
  if (!movements) return null;
  const lastActiveAt = Math.max(draft.startedAt, draft.lastActiveAt ?? draft.updatedAt);
  return {
    clientSessionId: draft.clientSessionId,
    startedAt: draft.startedAt,
    lastActiveAt,
    inactiveFinishAt:
      draft.inactiveFinishAt ?? inactiveWorkoutFinishAt(draft.startedAt, lastActiveAt),
    durationOverrideMinutes: draft.durationOverrideMinutes ?? null,
    pause: draftPause(draft),
    name: draft.name,
    workoutDate: draft.workoutDate,
    category: draft.category,
    workoutTypeId: draft.workoutTypeId ?? null,
    workoutTypeExplicit: draft.workoutTypeExplicit ?? false,
    skipHighRepWarning: draft.skipHighRepWarning ?? false,
    notes: draft.notes,
    movements,
  };
}

/** Records activity, which pushes back when a forgotten workout counts as finished. */
export function withActivity(state: LoggerState, now: number): LoggerState {
  return {
    ...state,
    lastActiveAt: now,
    inactiveFinishAt:
      now >= state.inactiveFinishAt
        ? inactiveWorkoutFinishAt(state.startedAt, now)
        : extendInactiveWorkoutFinishAt(state.inactiveFinishAt, now),
  };
}

export function selectedType(state: LoggerState, types: WorkoutType[]): WorkoutType {
  return effectiveWorkoutType(
    { category: state.category, workout_type_id: state.workoutTypeId },
    types,
  );
}

/** What the shared finish rules read, for a live (never an edited) workout. */
export function finishState(
  state: LoggerState,
  types: WorkoutType[],
  typesLoading: boolean,
): WorkoutFinishState {
  const type = selectedType(state, types);
  return {
    movements: state.movements,
    name: state.name,
    category: state.category,
    customTypeId: state.workoutTypeId,
    workoutTypeExplicit: state.workoutTypeExplicit,
    selectedType: type,
    typeOptions: types.filter((item) => !item.archived),
    types,
    typesLoading,
    editing: false,
    resumedWorkoutId: null,
    startedAt: state.startedAt,
    previousDurationMinutes: 0,
    durationOverrideMinutes: state.durationOverrideMinutes,
    pause: state.pause,
    editedDurationMinutes: 0,
    startTime: '',
    endTime: '',
    clientSessionId: state.clientSessionId,
    baseRevision: undefined,
    workoutDate: state.workoutDate,
    notes: state.notes,
  };
}

export function workoutIdentity(state: LoggerState, types: WorkoutType[]) {
  return liveWorkoutIdentity(finishState(state, types, false));
}

export function checkFinish(
  state: LoggerState,
  types: WorkoutType[],
  typesLoading: boolean,
  now: number,
): WorkoutFinishCheck {
  return checkWorkoutFinish(finishState(state, types, typesLoading), undefined, now);
}

export function finishInput(
  state: LoggerState,
  types: WorkoutType[],
  check: Extract<WorkoutFinishCheck, { kind: 'ready' }>,
) {
  return finishedWorkoutInput(finishState(state, types, false), check);
}

/** Ticked sets, and entered sets left unticked (which Finish leaves out). */
export function setCounts(state: LoggerState) {
  let ticked = 0;
  let unticked = 0;
  for (const movement of state.movements)
    for (const item of movement.sets) {
      if (item.completed) ticked += 1;
      else if (hasRecordedPerformance(movement.exercise.kind, item)) unticked += 1;
    }
  return { ticked, unticked };
}

const mapMovement = (
  state: LoggerState,
  movementKey: string,
  change: (movement: WorkoutDraftMovement) => WorkoutDraftMovement,
): LoggerState => ({
  ...state,
  movements: state.movements.map((movement) =>
    movement.key === movementKey ? change(movement) : movement,
  ),
});

/**
 * History older than the loaded workouts, for a workout on `date`. It only precedes workouts
 * inside the window it was condensed for, as on the web.
 */
export function olderHistoryFor(
  context: Pick<LoggerContext, 'historyBaselines'>,
  date: string,
): Map<string, ExerciseHistoryBaseline> | null {
  const baselines = context.historyBaselines;
  return baselines && date >= baselines.before ? baselines.byExercise : null;
}

/** Adds exercises from the picker, each with sets suggested from its last session. */
export function addExercises(
  state: LoggerState,
  selected: Exercise[],
  context: LoggerContext,
): LoggerState {
  const merged = mergeUniqueById(
    state.movements.map((item) => item.exercise),
    selected,
  );
  const additions: WorkoutDraftMovement[] = merged
    .slice(state.movements.length)
    .map((exercise) => ({
      key: context.newKey(),
      exercise,
      notes: '',
      ...machineSelection(exercise.id, {}),
      supersetKey: null,
      isComplete: false,
      sets: suggestedSetsFromHistory(
        context.workouts,
        exercise,
        state.workoutDate,
        undefined,
        olderHistoryFor(context, state.workoutDate),
        context.defaultRest,
        context.newKey,
      ),
    }));
  return { ...state, movements: [...state.movements, ...additions] };
}

export interface SetUpdateResult {
  state: LoggerState;
  /** The rest to count down now, or null. */
  restSeconds: number | null;
  loggingSet: boolean;
  /** In a superset, the exercise to do next in the round (which delays the rest). */
  nextInRound: WorkoutDraftMovement | null;
}

/** Applies an edit or tick to one set, as the web logger's updateSet does. */
export function updateSet(
  state: LoggerState,
  movementKey: string,
  setKey: string,
  update: Partial<WorkoutDraftSet>,
  { addedByHand, workoutBodyweight }: { addedByHand: boolean; workoutBodyweight: number | null },
): SetUpdateResult {
  const movement = state.movements.find((item) => item.key === movementKey);
  const effects = setUpdateEffects(movement, setKey, update, false);
  const nextInRound =
    effects.loggingSet && movement?.supersetKey
      ? nextInSupersetRound(
          state.movements.map((item) =>
            item.key === movementKey
              ? {
                  ...item,
                  sets: item.sets.map((set) =>
                    set.key === setKey ? { ...set, completed: true } : set,
                  ),
                }
              : item,
          ),
          movementKey,
        )
      : null;
  // Logging a set while paused carries on with the workout.
  const pause =
    effects.loggingSet && state.pause.pausedAt !== null ? resumeWorkout(state.pause) : state.pause;
  const next = mapMovement({ ...state, pause }, movementKey, (item) =>
    movementAfterSetUpdate(item, setKey, update, {
      finishesExercise: effects.finishesExercise,
      suggestNext: effects.loggingSet || effects.correctingLoggedSet,
      addedByHand,
      workoutBodyweight,
    }),
  );
  return {
    state: next,
    restSeconds: nextInRound ? null : effects.restSeconds,
    loggingSet: effects.loggingSet,
    nextInRound,
  };
}

export function setSetKind(
  state: LoggerState,
  movementKey: string,
  setKey: string,
  kind: SetKind,
): LoggerState {
  return updateSet(state, movementKey, setKey, setKindUpdate(kind), {
    addedByHand: false,
    workoutBodyweight: null,
  }).state;
}

/** Adds a set at the end, copying the one before it. Returns the new set's key too. */
export function addSet(
  state: LoggerState,
  movementKey: string,
  context: Pick<LoggerContext, 'defaultRest' | 'newKey'>,
): { state: LoggerState; setKey: string | null } {
  let setKey: string | null = null;
  const next = mapMovement(state, movementKey, (movement) => {
    const added = emptyDraftSet(
      movement.exercise.kind,
      movement.sets.at(-1),
      context.defaultRest,
      context.newKey(),
    );
    setKey = added.key;
    return { ...movement, isComplete: false, sets: [...movement.sets, added] };
  });
  return { state: next, setKey };
}

/** Removes a set; an exercise keeps at least one (remove the exercise instead). */
export function deleteSet(state: LoggerState, movementKey: string, setKey: string): LoggerState {
  return mapMovement(state, movementKey, (movement) =>
    movement.sets.length <= 1
      ? movement
      : {
          ...movement,
          sets: movement.sets.filter((item) => item.key !== setKey),
        },
  );
}

export function restoreSet(
  state: LoggerState,
  movementKey: string,
  set: WorkoutDraftSet,
  index: number,
): LoggerState {
  return mapMovement(state, movementKey, (movement) => {
    const sets = [...movement.sets];
    sets.splice(index, 0, set);
    return {
      ...movement,
      isComplete: movement.isComplete && sets.every((item) => item.completed),
      sets,
    };
  });
}

export function moveSet(
  state: LoggerState,
  movementKey: string,
  from: number,
  to: number,
): LoggerState {
  return mapMovement(state, movementKey, (movement) =>
    to < 0 || to >= movement.sets.length
      ? movement
      : { ...movement, sets: reorder(movement.sets, from, to) },
  );
}

export function moveMovement(state: LoggerState, index: number, direction: -1 | 1): LoggerState {
  const to = index + direction;
  if (to < 0 || to >= state.movements.length) return state;
  return { ...state, movements: reorder(state.movements, index, to) };
}

export function removeMovement(state: LoggerState, movementKey: string): LoggerState {
  return {
    ...state,
    movements: state.movements.filter((item) => item.key !== movementKey),
  };
}

/** Finishing an exercise logs its remaining entered sets; unfinishing only reopens it. */
export function completeExercise(
  state: LoggerState,
  movementKey: string,
  isComplete: boolean,
): LoggerState {
  return mapMovement(state, movementKey, (movement) => {
    const sets = isComplete
      ? completeRemainingSets(movement.exercise.kind, movement.sets)
      : movement.sets;
    return {
      ...movement,
      isComplete: isComplete && sets.every((set) => set.completed),
      sets,
    };
  });
}

export function setMovementNotes(
  state: LoggerState,
  movementKey: string,
  notes: string,
): LoggerState {
  return mapMovement(state, movementKey, (movement) => ({
    ...movement,
    notes,
  }));
}

export function groupSuperset(
  state: LoggerState,
  movementKey: string,
  partnerKeys: string[],
  newGroupKey: string,
): LoggerState {
  const grouped = applySupersetSelection(state.movements, movementKey, partnerKeys, newGroupKey);
  const groupKey = grouped.find((item) => item.key === movementKey)?.supersetKey;
  return {
    ...state,
    movements: groupKey ? keepSupersetTogether(grouped, groupKey) : grouped,
  };
}

export function ungroupSuperset(state: LoggerState, movementKey: string): LoggerState {
  return { ...state, movements: clearSuperset(state.movements, movementKey) };
}

export function togglePause(state: LoggerState, now: number): LoggerState {
  return {
    ...state,
    pause:
      state.pause.pausedAt === null
        ? pauseWorkout(state.pause, now)
        : resumeWorkout(state.pause, now),
  };
}

/** Picks a workout type, as the web's type menu does: an automatic name follows the type. */
export function chooseWorkoutType(
  state: LoggerState,
  type: WorkoutType,
  types: WorkoutType[],
): LoggerState {
  const current = selectedType(state, types);
  const automatic = ['', `${current.name} workout`, workoutNameForCategory(state.category)];
  return {
    ...state,
    name: automatic.includes(state.name.trim()) ? '' : state.name,
    workoutTypeId: type.is_custom ? type.id : null,
    category: type.is_custom ? 'other' : (type.id as WorkoutCategory),
    workoutTypeExplicit: true,
  };
}
