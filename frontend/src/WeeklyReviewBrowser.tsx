import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import type { WeightUnit } from './weightUnits';
import { weeklyReview, type WeeklyReviewData } from './weeklyReview';
import { reviewWeekName as weekName, reviewWeeksLimit } from './weeklyReviewDisplay';
import { WeeklyReviewBlock } from './WeeklyReviewBlock';
import { WeeklyReviewSummary } from './WeeklyReviewSummary';
import './muscleSets.css';

export type { WeeklyReviewData } from './weeklyReview';

/** One week's review with arrows to step through the earlier weeks and this week so far. */
export function WeeklyReviewBrowser({
  workouts,
  records,
  measurements,
  muscleWeeks,
  muscleGoal,
  muscleGoals,
  cardioWeeks,
  weightUnit,
  today,
  weekStartDay,
  initialWeeksAgo = 0,
  onOpenProgress,
  onOpenCardio,
  onOpenBody,
}: WeeklyReviewData & {
  weightUnit: WeightUnit;
  initialWeeksAgo?: number;
  onOpenProgress: (exerciseId?: string) => void;
  onOpenCardio: () => void;
  onOpenBody: () => void;
}) {
  const [requestedWeeksAgo, setWeeksAgo] = useState(initialWeeksAgo);
  const limit = reviewWeeksLimit(muscleWeeks.length);
  const weeksAgo = Math.min(requestedWeeksAgo, limit);
  const review = useMemo(
    () =>
      weeklyReview({
        workouts,
        records,
        measurements,
        muscleWeeks,
        muscleGoal,
        muscleGoals,
        cardioWeeks,
        today,
        weekStartDay,
        weeksAgo,
      }),
    [
      workouts,
      records,
      measurements,
      muscleWeeks,
      muscleGoal,
      muscleGoals,
      cardioWeeks,
      today,
      weekStartDay,
      weeksAgo,
    ],
  );

  return (
    <>
      <div className="muscle-week-nav weekly-review-week-nav" role="group" aria-label="Review week">
        <button
          type="button"
          aria-label="Previous week"
          disabled={weeksAgo >= limit}
          onClick={() => setWeeksAgo(weeksAgo + 1)}
        >
          <Icon name="chevron-left" />
        </button>
        <span aria-live="polite">{weekName(weeksAgo)}</span>
        <button
          type="button"
          aria-label="Next week"
          disabled={weeksAgo === 0}
          onClick={() => setWeeksAgo(weeksAgo - 1)}
        >
          <Icon name="chevron-right" />
        </button>
      </div>
      <WeeklyReviewSummary
        review={review}
        weightUnit={weightUnit}
        isCurrentWeek={weeksAgo === 0}
        onOpenProgress={onOpenProgress}
        onOpenCardio={onOpenCardio}
        onOpenBody={onOpenBody}
      />
      {/* About today rather than the week on show, so it stays with the two latest weeks. */}
      {weeksAgo <= 1 && (
        <WeeklyReviewBlock
          workouts={workouts}
          records={records}
          today={today}
          weekStartDay={weekStartDay}
        />
      )}
    </>
  );
}
