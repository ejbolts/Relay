import { useEffect, useMemo, useRef, useState } from 'react';
import type { WeeklyReviewData } from './WeeklyReviewBrowser';
import type { MuscleSetsWeek } from './liveMuscleSets';
import { useTrainingPreferences, useWeightUnit } from './trainingPreferencesContext';
import type { BodyMeasurement, DashboardData, PersonalRecord, TrackedWorkout } from './types';
import { weeklyReviewShownThisWeek } from './appNoticeRules';
import { lastWeekReview, weeklyReviewNoticeFor } from './weeklyReview';
import { markWeeklyReviewShown, weeklyReviewShownFor } from './weeklyReviewPromptState';
import { WeeklyReviewPopup } from './WeeklyReviewPopup';
import { onWeeklyReviewRequested, publishWeeklyReviewNotice } from './weeklyReviewNotice';

const NO_CARDIO_WEEKS: NonNullable<DashboardData['cardio_weeks']> = [];

/**
 * Opens the finished week's review the first time the app is used in a new week. It waits until
 * the dashboard has loaded for the current week, so a cached older dashboard is never reviewed as
 * if it were last week's, and stays quiet when the person logged nothing themselves that week.
 * While a review is available it is also listed in the notifications inbox to open again.
 */
export function WeeklyReviewPrompt({
  userId,
  enabled,
  shownElsewhere = null,
  onShown,
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
  /** The latest week another of the account's devices has already shown. */
  shownElsewhere?: string | null;
  /** Called when the review opens by itself, with the week it was shown in. */
  onShown?: (weekStart: string) => void;
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
  // Read once per account, so the popup stays open after it records that it was shown.
  const shownBefore = useMemo(() => weeklyReviewShownFor(userId), [userId]);
  const [dismissedWeek, setDismissedWeek] = useState<string | null>(null);
  const [seenWeek, setSeenWeek] = useState(shownBefore);
  const [requested, setRequested] = useState(false);

  const lastWeek = useMemo(
    () =>
      lastWeekReview({
        loaded: dashboard !== null,
        dashboardWeekStart,
        workouts,
        records,
        measurements,
        muscleWeeks,
        muscleGoal,
        muscleGoals,
        cardioWeeks: dashboard?.cardio_weeks ?? NO_CARDIO_WEEKS,
        today,
      }),
    [
      dashboard,
      dashboardWeekStart,
      workouts,
      records,
      measurements,
      muscleWeeks,
      muscleGoal,
      muscleGoals,
      today,
    ],
  );
  const { currentStart, weekStartDay, review, available } = lastWeek;
  const shownThisWeek = weeklyReviewShownThisWeek(shownBefore, shownElsewhere, currentStart);
  const autoOpen = enabled && available && !shownThisWeek && dismissedWeek !== currentStart;
  // Once it has opened by itself it stays until closed: recording that it was shown makes the
  // account report this week as seen, which must not shut the review that reported it.
  const [openedWeek, setOpenedWeek] = useState<string | null>(null);
  const stillOpen = openedWeek === currentStart && dismissedWeek !== currentStart;
  const open = available && (requested || autoOpen || stillOpen);

  useEffect(
    () => setSeenWeek(shownThisWeek ? currentStart : shownBefore),
    [shownBefore, shownThisWeek, currentStart],
  );

  const onShownRef = useRef(onShown);
  onShownRef.current = onShown;
  useEffect(() => {
    if (!open) return;
    markWeeklyReviewShown(userId, currentStart);
    setSeenWeek(currentStart);
    if (autoOpen) {
      setOpenedWeek(currentStart);
      onShownRef.current?.(currentStart);
    }
    // Only the opening matters: closing it clears `autoOpen` without another report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, currentStart]);

  useEffect(() => onWeeklyReviewRequested(() => setRequested(true)), []);

  useEffect(() => {
    publishWeeklyReviewNotice(weeklyReviewNoticeFor({ available, review, currentStart }, seenWeek));
  }, [available, review, seenWeek, currentStart]);

  useEffect(() => () => publishWeeklyReviewNotice(null), []);

  if (!open || !dashboard) return null;
  const close = () => {
    setDismissedWeek(currentStart);
    setRequested(false);
  };
  const data: WeeklyReviewData = {
    workouts,
    records,
    measurements,
    muscleWeeks,
    muscleGoal,
    muscleGoals,
    cardioWeeks: dashboard.cardio_weeks ?? NO_CARDIO_WEEKS,
    today,
    weekStartDay,
  };
  return (
    <WeeklyReviewPopup
      data={data}
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
