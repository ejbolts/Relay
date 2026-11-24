import { useMemo } from 'react';
import {
  finishedWorkoutKey,
  readFinishedWorkouts,
} from '../../../../frontend/src/finishedWorkoutQueue';
import {
  finishedMuscleSourcesFor,
  LIVE_WORKOUT_ID,
  liveMuscleSetsWithFinished,
  type FinishedMuscleSource,
  type MuscleSetsWeek,
} from '../../../../frontend/src/liveMuscleSets';
import type { Exercise, TrackedWorkout } from '../../../../frontend/src/types';
import type { ActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import { createWorkoutSet, isCompletedWorkingSet } from '../../../../frontend/src/workoutSets';
import { deviceStorage } from '../../data/deviceStorage';
import { loggerToDraft } from '../workout/loggerState';
import type { LoggerState } from '../workout/loggerState';
import { useLogger, useOptionalWorkout } from '../workout/WorkoutProvider';
import { awaitingDashboard, useJustSavedWorkouts } from './justSavedWorkouts';

const NO_EXERCISES: Exercise[] = [];
const NO_FINISHED: FinishedMuscleSource[] = [];
const COMPLETED_SET = {
  ...createWorkoutSet('strength', undefined, false),
  key: 'credit',
  completed: true,
};

/** The workouts the dashboard doesn't count yet, for projecting onto its muscle set weeks. */
export interface LiveMuscleSources {
  draft: ActiveWorkoutDraft | null;
  exercises: Exercise[];
  finished: FinishedMuscleSource[];
  /** The contribution id the workout in progress uses (its saved id when resumed). */
  liveWorkoutId: string | null;
}

/**
 * Only what a draft's muscle set credits depend on: its identity, name, date and each exercise's
 * completed working sets. Typing a weight, ticking the clock or pausing leaves it unchanged, so
 * the screens that count live sets don't recompute on every logger change.
 */
export function creditKey(state: LoggerState | null, shownName?: string | null): string {
  if (!state) return '';
  const draft = loggerToDraft(state, state.lastActiveAt);
  const credited: ActiveWorkoutDraft = {
    version: 1,
    clientSessionId: draft.clientSessionId,
    ...(draft.resumingWorkoutId && { resumingWorkoutId: draft.resumingWorkoutId }),
    startedAt: draft.startedAt,
    updatedAt: 0,
    // An unnamed workout's sets are listed under the name the logger shows for it.
    name: draft.name.trim() || shownName || draft.name,
    workoutDate: draft.workoutDate,
    category: draft.category,
    notes: '',
    movements: draft.movements.map((movement) => ({
      key: movement.key,
      exerciseId: movement.exerciseId,
      notes: '',
      machinePhotoIds: [],
      supersetKey: null,
      sets: Array.from(
        { length: movement.sets.filter(isCompletedWorkingSet).length },
        () => COMPLETED_SET,
      ),
    })),
  };
  return JSON.stringify(credited);
}

/**
 * The workout in progress, finished workouts waiting to sync (not refused, not already sent) and
 * workouts saved since `dashboard` loaded, from the workout engine; none outside a provider.
 */
export function useLiveMuscleSources(userId: string, dashboard: unknown): LiveMuscleSources {
  const workout = useOptionalWorkout();
  const logger = useLogger();
  const justSaved = useJustSavedWorkouts();
  const key = creditKey(logger?.state ?? null, workout?.live?.name);
  const draft = useMemo(() => (key ? (JSON.parse(key) as ActiveWorkoutDraft) : null), [key]);
  const queue = workout?.queue ?? null;
  const exercises = logger?.exercises ?? NO_EXERCISES;
  // Read again whenever the queue's status changes (a workout finished, sent or refused).
  const finished = useMemo(() => {
    if (!queue) return NO_FINISHED;
    // Acknowledged saves the phone couldn't drop from storage are counted as saved instead.
    const sent = new Set(queue.sent ?? []);
    return finishedMuscleSourcesFor(
      awaitingDashboard(justSaved, userId, dashboard).map((item) => ({
        id: item.id,
        finished: item.finished,
      })),
      readFinishedWorkouts(deviceStorage).filter(
        (item) => item.pendingSave.userId === userId && !sent.has(finishedWorkoutKey(item)),
      ),
      queue.refusals,
    );
  }, [queue, justSaved, userId, dashboard]);
  return useMemo(
    () => ({
      draft,
      exercises,
      finished,
      liveWorkoutId: draft ? (draft.resumingWorkoutId ?? LIVE_WORKOUT_ID) : null,
    }),
    [draft, exercises, finished],
  );
}

/** A dashboard week with the live sources' sets, through the web's shared module. */
export function withLiveMuscleSets(
  week: MuscleSetsWeek,
  live: LiveMuscleSources,
  workouts: TrackedWorkout[],
  today: string,
): MuscleSetsWeek {
  if (!live.draft && !live.finished.length) return week;
  return liveMuscleSetsWithFinished(
    week,
    live.draft,
    live.exercises,
    workouts,
    today,
    live.finished,
  );
}
