import { historyOnMachine, recentExerciseHistory, withSuggestedSets } from './exerciseHistory';
import { withLastSessionReps, withLastSessionValues } from './lastSessionSet';
import { progressionTarget, progressionWeightKg } from './repProgression';
import type { SessionTemplate } from './trainingSummary';
import type {
  Exercise,
  ExerciseHistoryBaseline,
  RepRange,
  TrackedSet,
  TrackedWorkout,
  WorkoutSetInput,
} from './types';
import type { WeightUnit } from './weightUnits';
import type { WorkoutDraftMovement, WorkoutDraftSet } from './workoutMovements';
import { createSuggestedWorkoutSet, createWorkoutSet, latestExerciseSets } from './workoutSets';

// How a live workout's exercises and sets are pre-filled: from a plan, the last session or
// nothing. Plain functions with no React or browser APIs: the web logger and the native app
// (mobile/) both use them. `newKey` makes each row's key (crypto.randomUUID on the web).

/** A blank set, copying `previous` when there is one, as Add set does. */
export function emptyDraftSet(
  kind: Exercise['kind'],
  previous: WorkoutSetInput | undefined,
  defaultRest: number | null,
  key: string,
): WorkoutDraftSet {
  return {
    key,
    ...createWorkoutSet(kind, previous, previous === undefined, defaultRest),
    restRevealed: true,
    ...(previous && { fromPrevious: true }),
  };
}

/** Sets pre-filled from the exercise's most recent session, marked as suggestions. */
export function suggestedSetsFromHistory(
  workouts: TrackedWorkout[],
  exercise: Exercise,
  onOrBeforeDate: string,
  excludedWorkoutId: string | undefined,
  olderHistory: Map<string, ExerciseHistoryBaseline> | null | undefined,
  defaultRest: number | null,
  newKey: () => string,
): WorkoutDraftSet[] {
  let previousSets = latestExerciseSets(workouts, exercise.id, onOrBeforeDate, excludedWorkoutId);
  // Not logged in the loaded window: fall back to its latest session from older history.
  const older = olderHistory?.get(exercise.id)?.latest;
  if (
    !previousSets.length &&
    older &&
    older.workout_id !== excludedWorkoutId &&
    older.workout_date <= onOrBeforeDate
  ) {
    previousSets = older.sets;
  }
  if (!previousSets.length) return [emptyDraftSet(exercise.kind, undefined, defaultRest, newKey())];
  return previousSets.map((previous) => ({
    key: newKey(),
    ...createSuggestedWorkoutSet(exercise.kind, previous),
    fromPrevious: true,
    restRevealed: false,
  }));
}

/**
 * The sets an exercise added from the picker starts with: with a machine chosen there, that
 * machine's last session, else the exercise's own last session, as suggestedSetsFromHistory.
 */
export function suggestedSetsForPickedExercise(
  workouts: TrackedWorkout[],
  exercise: Exercise,
  onOrBeforeDate: string,
  excludedWorkoutId: string | undefined,
  olderHistory: Map<string, ExerciseHistoryBaseline> | null | undefined,
  defaultRest: number | null,
  machineId: string | undefined,
  newKey: () => string,
): WorkoutDraftSet[] {
  const onMachine =
    machineId &&
    historyOnMachine(
      recentExerciseHistory(
        workouts.filter((workout) => workout.workout_date <= onOrBeforeDate),
        exercise.id,
        excludedWorkoutId,
        Number.POSITIVE_INFINITY,
      ),
      machineId,
      new Map(),
    ).find((entry) => entry.sets.length)?.sets;
  if (onMachine) return withSuggestedSets([], onMachine, exercise.kind, newKey);
  return suggestedSetsFromHistory(
    workouts,
    exercise,
    onOrBeforeDate,
    excludedWorkoutId,
    olderHistory,
    defaultRest,
    newKey,
  );
}

export interface TemplateMovementContext {
  /** Loaded recent workouts; `historyBaselines` condenses everything older. */
  workouts: TrackedWorkout[];
  historyBaselines?: {
    before: string;
    byExercise: Map<string, ExerciseHistoryBaseline>;
  } | null;
  /** The day the workout starts on. */
  date: string;
  weightUnit: WeightUnit;
  defaultRest: number | null;
  newKey: () => string;
}

/** The exercise's latest session, from older history when the loaded window lacks it. */
function latestSessionOf(exerciseId: string, context: TemplateMovementContext): TrackedSet[] {
  const { workouts, historyBaselines, date } = context;
  const loaded = latestExerciseSets(workouts, exerciseId, date);
  if (loaded.length || !historyBaselines || date < historyBaselines.before) return loaded;
  const older = historyBaselines.byExercise.get(exerciseId)?.latest;
  return older && older.workout_date <= date ? older.sets : [];
}

function templateMovement(
  exercise: Exercise,
  plannedSets: SessionTemplate['exercises'][number]['plannedSets'],
  repRange: RepRange | undefined,
  targetWeight: number | null,
  lastSession: TrackedSet[],
  context: TemplateMovementContext,
): WorkoutDraftMovement {
  const { workouts, historyBaselines, date, defaultRest, newKey } = context;
  return {
    key: newKey(),
    exercise,
    ...(repRange && { repRange }),
    notes: '',
    machinePhotoIds: [],
    machinePhotosInitialized: false,
    supersetKey: null,
    isComplete: false,
    sets: plannedSets
      ? // At last time's weight, a row shows last time's reps: the range is the target.
        withLastSessionReps(
          // What the plan leaves blank comes from last time, as for an exercise added by hand.
          withLastSessionValues(
            plannedSets.map((set) => ({
              ...createWorkoutSet(exercise.kind),
              ...set,
              ...(targetWeight !== null &&
                set.weight_kg == null &&
                set.set_type !== 'warmup' && { weight_kg: targetWeight }),
              key: newKey(),
              warmup: set.set_type === 'warmup',
              completed: false,
              fromPrevious: true,
              restRevealed: false,
            })),
            lastSession,
            exercise.kind === 'strength' ? defaultRest : null,
          ),
          lastSession,
        )
      : suggestedSetsFromHistory(
          workouts,
          exercise,
          date,
          undefined,
          historyBaselines && date >= historyBaselines.before ? historyBaselines.byExercise : null,
          defaultRest,
          newKey,
        ),
  };
}

/** Draft rows for planned or last-session exercises, with sets suggested from history. */
export function templateDraftMovements(
  items: SessionTemplate['exercises'],
  context: TemplateMovementContext,
): WorkoutDraftMovement[] {
  return items.map(({ exercise, plannedSets, repRange }) => {
    const ranged = repRange && plannedSets && exercise.kind !== 'cardio';
    const lastSession =
      plannedSets && exercise.kind === 'strength' ? latestSessionOf(exercise.id, context) : [];
    // A planned range suggests its target weight for working sets the plan left blank.
    const targetWeight = ranged
      ? progressionWeightKg(progressionTarget(repRange, lastSession, context.weightUnit))
      : null;
    return templateMovement(exercise, plannedSets, repRange, targetWeight, lastSession, context);
  });
}
