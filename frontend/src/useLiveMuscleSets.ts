import { useEffect, useMemo, useState } from 'react';
import { LIVE_WORKOUT_ID, liveMuscleSets, type MuscleSetsWeek } from './liveMuscleSets';
import {
  ACTIVE_WORKOUT_CHANGE_EVENT,
  ACTIVE_WORKOUT_DRAFT_KEY,
  readActiveWorkoutDraft,
  type ActiveWorkoutDraft,
} from './workoutDraft';
import { localDate } from './utils';
import type { DashboardData, Exercise, TrackedWorkout } from './types';

/** A finished workout counted before the dashboard includes it, with its own contribution id. */
export interface FinishedMuscleSource {
  id: string;
  draft: ActiveWorkoutDraft;
}

const NONE: FinishedMuscleSource[] = [];

export function useLiveMuscleSets(
  dashboard: DashboardData | null,
  exercises: Exercise[],
  workouts: TrackedWorkout[],
  /** Finished workouts waiting to sync, and saved ones the dashboard does not include yet. */
  finished: FinishedMuscleSource[] = NONE,
) {
  const [activeDraft, setActiveDraft] = useState(readActiveWorkoutDraft);
  useEffect(() => {
    const update = () => setActiveDraft(readActiveWorkoutDraft());
    const onStorage = (event: StorageEvent) => {
      if (event.key === ACTIVE_WORKOUT_DRAFT_KEY || event.key === null) update();
    };
    update();
    window.addEventListener(ACTIVE_WORKOUT_CHANGE_EVENT, update);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(ACTIVE_WORKOUT_CHANGE_EVENT, update);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  // A finished workout an older release left in the draft is counted with the queue instead.
  const draft = activeDraft?.pendingSave ? null : activeDraft;
  const today = localDate();
  return useMemo(() => {
    const withWorkouts = (week: MuscleSetsWeek) =>
      liveMuscleSets(
        finished.reduce(
          (current, source) =>
            liveMuscleSets(current, source.draft, exercises, workouts, today, source.id),
          week,
        ),
        draft,
        exercises,
        workouts,
        today,
      );
    return {
      weeklySets: dashboard?.weekly_sets ? withWorkouts(dashboard.weekly_sets) : undefined,
      history: dashboard?.weekly_sets_history?.map(withWorkouts),
      workoutId: draft ? (draft.resumingWorkoutId ?? LIVE_WORKOUT_ID) : null,
    };
  }, [dashboard, draft, exercises, finished, workouts, today]);
}
