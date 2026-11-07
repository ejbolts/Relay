import { useEffect, useMemo, useRef, useState } from 'react';
import { LIVE_WORKOUT_ID, liveMuscleSets } from './liveMuscleSets';
import {
  ACTIVE_WORKOUT_CHANGE_EVENT,
  ACTIVE_WORKOUT_DRAFT_KEY,
  readActiveWorkoutDraft,
} from './workoutDraft';
import { localDate } from './utils';
import type { DashboardData, Exercise, TrackedWorkout } from './types';

export function useLiveMuscleSets(
  dashboard: DashboardData | null,
  exercises: Exercise[],
  workouts: TrackedWorkout[],
) {
  const dashboardRef = useRef(dashboard);
  dashboardRef.current = dashboard;
  const [snapshot, setSnapshot] = useState(() => ({
    draft: readActiveWorkoutDraft(),
    awaitingDashboard: null as DashboardData | null,
  }));
  useEffect(() => {
    const update = () => {
      const draft = readActiveWorkoutDraft();
      setSnapshot((current) => {
        // A successful background save clears storage before its dashboard read returns.
        // Keep the final credits visible until that authoritative response replaces them.
        if (!draft && current.draft?.pendingSave)
          return {
            draft: current.draft,
            awaitingDashboard: current.awaitingDashboard ?? dashboardRef.current,
          };
        return { draft, awaitingDashboard: null };
      });
    };
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
  const draft =
    snapshot.awaitingDashboard && snapshot.awaitingDashboard !== dashboard ? null : snapshot.draft;
  const today = localDate();
  return useMemo(
    () => ({
      weeklySets: dashboard?.weekly_sets
        ? liveMuscleSets(dashboard.weekly_sets, draft, exercises, workouts, today)
        : undefined,
      history: dashboard?.weekly_sets_history?.map((week) =>
        liveMuscleSets(week, draft, exercises, workouts, today),
      ),
      workoutId: draft ? (draft.resumingWorkoutId ?? LIVE_WORKOUT_ID) : null,
    }),
    [dashboard, draft, exercises, workouts, today],
  );
}
