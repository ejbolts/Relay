import { useMemo } from 'react';
import { weeklyReviewShownThisWeek } from '../../../../frontend/src/appNoticeRules';
import { readFinishedWorkouts } from '../../../../frontend/src/finishedWorkoutQueue';
import {
  finishedMuscleSourcesFor,
  liveMuscleSetsWithFinished,
  type FinishedMuscleSource,
} from '../../../../frontend/src/liveMuscleSets';
import type { CardioWeek, Exercise } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import {
  lastWeekReview,
  reviewMuscleWeeks,
  weeklyReviewNoticeFor,
  type WeeklyReviewData,
} from '../../../../frontend/src/weeklyReview';
import {
  useDashboard,
  usePersonalRecords,
  useTrainingPreferences,
  useWorkoutHistory,
} from '../../data/queries';
import { deviceStorage } from '../../data/deviceStorage';
import { useUser } from '../../session/SessionProvider';
import { useBodyMeasurements } from '../body/bodyQueries';
import { loggerToDraft } from '../workout/loggerState';
import { useLogger, useOptionalWorkout } from '../workout/WorkoutProvider';
import { useAppNotices } from './appNotices';
import { awaitingDashboard, useJustSavedWorkouts } from './justSavedWorkouts';
import { useNoticeMemory, weeklyReviewShownFor } from './noticeMemory';

const NO_CARDIO_WEEKS: CardioWeek[] = [];
const NO_EXERCISES: Exercise[] = [];
const NO_FINISHED: FinishedMuscleSource[] = [];

/**
 * The weekly review as the web works it out, from Home's data: every week's figures for the
 * review screen, and whether last week's review is available, already shown (here or on another
 * of the account's devices) and new in the bell. Its muscle sets count the workout in progress,
 * finished ones waiting to sync and ones saved since the dashboard loaded, as the web's do.
 */
export function useWeeklyReview() {
  const user = useUser();
  const today = localDate();
  const dashboard = useDashboard().data;
  const workouts = useWorkoutHistory().data;
  const records = usePersonalRecords().data;
  const measurements = useBodyMeasurements().data;
  const preferences = useTrainingPreferences().data;
  const notices = useAppNotices(user.id);
  useNoticeMemory();
  const live = useLiveSources(user.id, dashboard);
  const dashboardWeekStart = dashboard?.weekly_sets?.week_start ?? null;
  const input = useMemo(
    () => ({
      workouts: workouts ?? [],
      records: records ?? [],
      measurements: measurements ?? [],
      muscleWeeks: reviewMuscleWeeks(dashboard?.weekly_sets, dashboard?.weekly_sets_history).map(
        (week) =>
          liveMuscleSetsWithFinished(
            week,
            live.draft,
            live.exercises,
            workouts ?? [],
            today,
            live.finished,
          ),
      ),
      muscleGoal: preferences?.weekly_muscle_set_goal ?? 10,
      muscleGoals: preferences?.weekly_muscle_set_goals,
      cardioWeeks: dashboard?.cardio_weeks ?? NO_CARDIO_WEEKS,
      today,
    }),
    [workouts, records, measurements, dashboard, preferences, today, live],
  );
  const lastWeek = useMemo(
    () => lastWeekReview({ ...input, loaded: !!dashboard, dashboardWeekStart }),
    [input, dashboard, dashboardWeekStart],
  );
  const data: WeeklyReviewData = { ...input, weekStartDay: lastWeek.weekStartDay };
  const shownHere = weeklyReviewShownFor(user.id);
  const shownThisWeek = weeklyReviewShownThisWeek(
    shownHere,
    notices.notices?.weekly_review_seen,
    lastWeek.currentStart,
  );
  return {
    ...lastWeek,
    data,
    shownThisWeek,
    /** The account has said what it has seen, so the review may open by itself. */
    ready: notices.ready,
    notice: weeklyReviewNoticeFor(lastWeek, shownThisWeek ? lastWeek.currentStart : shownHere),
  };
}

/** The workouts the dashboard doesn't count yet, from the workout engine (none without one). */
function useLiveSources(userId: string, dashboard: unknown) {
  const workout = useOptionalWorkout();
  const logger = useLogger();
  const justSaved = useJustSavedWorkouts();
  const state = logger?.state ?? null;
  const queue = workout?.queue ?? null;
  const exercises = logger?.exercises ?? NO_EXERCISES;
  const draft = useMemo(() => (state ? loggerToDraft(state, state.lastActiveAt) : null), [state]);
  // Read again whenever the queue's status changes (a workout finished, sent or refused).
  const finished = useMemo(
    () =>
      queue
        ? finishedMuscleSourcesFor(
            awaitingDashboard(justSaved, userId, dashboard).map((item) => ({
              id: item.id,
              finished: item.finished,
            })),
            readFinishedWorkouts(deviceStorage).filter((item) => item.pendingSave.userId === userId),
            queue.refusals,
          )
        : NO_FINISHED,
    [queue, justSaved, userId, dashboard],
  );
  return useMemo(() => ({ draft, exercises, finished }), [draft, exercises, finished]);
}
