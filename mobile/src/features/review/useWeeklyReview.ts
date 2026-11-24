import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { weeklyReviewShownThisWeek } from '../../../../frontend/src/appNoticeRules';
import { liveMuscleSetsWithFinished } from '../../../../frontend/src/liveMuscleSets';
import type { CardioWeek, Exercise } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import {
  lastWeekReview,
  reviewMuscleWeeks,
  weeklyReviewNoticeFor,
  type WeeklyReviewData,
} from '../../../../frontend/src/weeklyReview';
import { apiGet } from '../../data/api';
import {
  queryKeys,
  useDashboard,
  usePersonalRecords,
  useTrainingPreferences,
  useWorkoutHistory,
} from '../../data/queries';
import { useUser } from '../../session/SessionProvider';
import { useBodyMeasurements } from '../body/bodyQueries';
import { useAppNotices } from './appNotices';
import { reviewWorkoutSources, useLiveWorkoutSources } from './liveWorkoutSources';
import { useNoticeMemory, weeklyReviewShownFor } from './noticeMemory';

const NO_CARDIO_WEEKS: CardioWeek[] = [];
const NO_EXERCISES: Exercise[] = [];

/**
 * The weekly review as the web works it out, from Home's data: every week's figures for the
 * review screen, and whether last week's review is available, already shown (here or on another
 * of the account's devices) and new in the bell. Muscle sets include an unsaved or just-finished
 * workout through the shared `liveMuscleSets` module, without double-counting once it saves.
 */
export function useWeeklyReview() {
  const user = useUser();
  const today = localDate();
  const dashboardQuery = useDashboard();
  const dashboard = dashboardQuery.data;
  const dashboardUpdatedAt = dashboardQuery.dataUpdatedAt;
  const workouts = useWorkoutHistory().data;
  const records = usePersonalRecords().data;
  const measurements = useBodyMeasurements().data;
  const preferences = useTrainingPreferences().data;
  const notices = useAppNotices(user.id);
  const liveSources = useLiveWorkoutSources();
  useNoticeMemory();
  const workoutSources = useMemo(
    () => reviewWorkoutSources(user.id, liveSources, dashboard ?? null, dashboardUpdatedAt),
    [user.id, liveSources, dashboard, dashboardUpdatedAt],
  );
  const hasLiveWorkouts = workoutSources.draft !== null || workoutSources.finished.length > 0;
  // WorkoutProvider keeps the exercise list warm in the app; only ask the server when needed.
  const exercisesQuery = useQuery({
    queryKey: queryKeys.exercises,
    queryFn: ({ signal }) => apiGet<Exercise[]>('/api/exercises', signal),
    staleTime: 5 * 60_000,
    enabled: hasLiveWorkouts,
  });
  const exercises = useMemo(() => {
    if (!hasLiveWorkouts) return NO_EXERCISES;
    const fetched = exercisesQuery.data ?? NO_EXERCISES;
    if (!workoutSources.exercises.length) return fetched;
    if (!fetched.length) return workoutSources.exercises;
    const byId = new Map<string, Exercise>();
    for (const item of [...workoutSources.exercises, ...fetched]) byId.set(item.id, item);
    return [...byId.values()];
  }, [hasLiveWorkouts, workoutSources.exercises, exercisesQuery.data]);
  const dashboardWeekStart = dashboard?.weekly_sets?.week_start ?? null;
  const input = useMemo(() => {
    const baseWeeks = reviewMuscleWeeks(dashboard?.weekly_sets, dashboard?.weekly_sets_history);
    const savedWorkouts = workouts ?? [];
    const muscleWeeks = hasLiveWorkouts
      ? baseWeeks.map((week) =>
          liveMuscleSetsWithFinished(
            week,
            workoutSources.draft,
            exercises,
            savedWorkouts,
            today,
            workoutSources.finished,
          ),
        )
      : baseWeeks;
    return {
      workouts: savedWorkouts,
      records: records ?? [],
      measurements: measurements ?? [],
      muscleWeeks,
      muscleGoal: preferences?.weekly_muscle_set_goal ?? 10,
      muscleGoals: preferences?.weekly_muscle_set_goals,
      cardioWeeks: dashboard?.cardio_weeks ?? NO_CARDIO_WEEKS,
      today,
    };
  }, [
    workouts,
    records,
    measurements,
    dashboard,
    preferences,
    today,
    hasLiveWorkouts,
    workoutSources,
    exercises,
  ]);
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
