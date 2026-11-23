import { useMemo } from 'react';
import { weeklyReviewShownThisWeek } from '../../../../frontend/src/appNoticeRules';
import type { CardioWeek } from '../../../../frontend/src/types';
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
import { useUser } from '../../session/SessionProvider';
import { useBodyMeasurements } from '../body/bodyQueries';
import { useAppNotices } from './appNotices';
import { useNoticeMemory, weeklyReviewShownFor } from './noticeMemory';

const NO_CARDIO_WEEKS: CardioWeek[] = [];

/**
 * The weekly review as the web works it out, from Home's data: every week's figures for the
 * review screen, and whether last week's review is available, already shown (here or on another
 * of the account's devices) and new in the bell.
 */
export function useWeeklyReview() {
  const user = useUser();
  const today = localDate();
  const dashboard = useDashboard().data;
  const workouts = useWorkoutHistory().data;
  const records = usePersonalRecords().data;
  const measurements = useBodyMeasurements().data;
  const preferences = useTrainingPreferences().data;
  const notices = useAppNotices();
  useNoticeMemory();
  const dashboardWeekStart = dashboard?.weekly_sets?.week_start ?? null;
  const input = useMemo(
    () => ({
      workouts: workouts ?? [],
      records: records ?? [],
      measurements: measurements ?? [],
      muscleWeeks: reviewMuscleWeeks(dashboard?.weekly_sets, dashboard?.weekly_sets_history),
      muscleGoal: preferences?.weekly_muscle_set_goal ?? 10,
      muscleGoals: preferences?.weekly_muscle_set_goals,
      cardioWeeks: dashboard?.cardio_weeks ?? NO_CARDIO_WEEKS,
      today,
    }),
    [workouts, records, measurements, dashboard, preferences, today],
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
