import { useEffect, useMemo, useState } from 'react';
import type { MuscleSetsWeek } from './liveMuscleSets';
import { useTrainingPreferences, useWeightUnit } from './trainingPreferencesContext';
import type { BodyMeasurement, DashboardData, PersonalRecord, TrackedWorkout } from './types';
import { addDays, weekStartDayFrom, weekStartFor } from './trainingSummary';
import { reviewHasActivity, weeklyReview } from './weeklyReview';
import { markWeeklyReviewShown, weeklyReviewShownFor } from './weeklyReviewPromptState';
import { WeeklyReviewPopup } from './WeeklyReviewPopup';

const NO_CARDIO_WEEKS: NonNullable<DashboardData['cardio_weeks']> = [];

/**
 * Opens the finished week's review the first time the app is used in a new week. It waits until
 * the dashboard has loaded for the current week, so a cached older dashboard is never reviewed as
 * if it were last week's, and stays quiet when the person logged nothing themselves that week.
 */
export function WeeklyReviewPrompt({
  userId,
  enabled,
  dashboard,
  muscleWeeks,
  workouts,
  records,
  measurements,
  today,
  onOpenProgress,
  onOpenCardio,
  onOpenBody,
}: {
  userId: string;
  /** False while another dialog, onboarding step or screen should keep the person's attention. */
  enabled: boolean;
  dashboard: DashboardData | null;
  /** Per-muscle sets for the current week followed by earlier weeks, newest first. */
  muscleWeeks: MuscleSetsWeek[];
  workouts: TrackedWorkout[];
  records: PersonalRecord[];
  measurements: BodyMeasurement[];
  today: string;
  onOpenProgress: (exerciseId?: string) => void;
  onOpenCardio: () => void;
  onOpenBody: () => void;
}) {
  const weightUnit = useWeightUnit();
  const musclePreferences = useTrainingPreferences().preferences;
  const muscleGoal = musclePreferences?.weekly_muscle_set_goal ?? 10;
  const muscleGoals = musclePreferences?.weekly_muscle_set_goals;
  const dashboardWeekStart = dashboard?.weekly_sets?.week_start ?? null;
  const weekStartDay = weekStartDayFrom(dashboardWeekStart);
  const currentStart = weekStartFor(today, weekStartDay);
  // Read once per account, so the popup stays open after it records that it was shown.
  const shownBefore = useMemo(() => weeklyReviewShownFor(userId), [userId]);
  const [dismissedWeek, setDismissedWeek] = useState<string | null>(null);
  const fresh = dashboard !== null && dashboardWeekStart === currentStart;

  const review = useMemo(
    () =>
      fresh
        ? weeklyReview({
            workouts,
            records,
            measurements,
            muscleWeeks,
            muscleGoal,
            muscleGoals,
            cardioWeeks: dashboard.cardio_weeks ?? NO_CARDIO_WEEKS,
            today,
            weekStartDay,
            weeksAgo: 1,
          })
        : null,
    [
      fresh,
      dashboard,
      workouts,
      records,
      measurements,
      muscleWeeks,
      muscleGoal,
      muscleGoals,
      today,
      weekStartDay,
    ],
  );
  const lastWeekEnd = addDays(currentStart, -1);
  const loggedItself =
    review !== null &&
    workouts.some(
      (workout) =>
        !workout.is_sample &&
        workout.workout_date >= review.weekStart &&
        workout.workout_date <= lastWeekEnd,
    );
  const open =
    enabled &&
    review !== null &&
    loggedItself &&
    reviewHasActivity(review) &&
    shownBefore !== currentStart &&
    dismissedWeek !== currentStart;

  useEffect(() => {
    if (open) markWeeklyReviewShown(userId, currentStart);
  }, [open, userId, currentStart]);

  if (!open || !review) return null;
  const close = () => setDismissedWeek(currentStart);
  return (
    <WeeklyReviewPopup
      review={review}
      weightUnit={weightUnit}
      onClose={close}
      onOpenProgress={(exerciseId) => {
        close();
        onOpenProgress(exerciseId);
      }}
      onOpenCardio={() => {
        close();
        onOpenCardio();
      }}
      onOpenBody={() => {
        close();
        onOpenBody();
      }}
    />
  );
}
