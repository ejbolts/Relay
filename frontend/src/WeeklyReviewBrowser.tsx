import { useMemo, useState } from 'react';
import type { MuscleSetGoals } from './muscleSetGoals';
import { Icon } from './Icon';
import type { MuscleSetsWeek } from './liveMuscleSets';
import type { BodyMeasurement, CardioWeek, PersonalRecord, TrackedWorkout } from './types';
import type { WeightUnit } from './weightUnits';
import { weeklyReview } from './weeklyReview';
import { WeeklyReviewBlock } from './WeeklyReviewBlock';
import { WeeklyReviewSummary } from './WeeklyReviewSummary';
import './muscleSets.css';

const MAX_WEEKS_AGO = 11;

const weekName = (weeksAgo: number) =>
  weeksAgo === 0 ? 'This week' : weeksAgo === 1 ? 'Last week' : `${weeksAgo} weeks ago`;

export interface WeeklyReviewData {
  workouts: TrackedWorkout[];
  records: PersonalRecord[];
  measurements: BodyMeasurement[];
  /** Per-muscle sets for the current week followed by earlier weeks, newest first. */
  muscleWeeks: MuscleSetsWeek[];
  muscleGoal: number;
  muscleGoals?: MuscleSetGoals;
  /** Cardio for the current week then earlier weeks, newest first. */
  cardioWeeks: CardioWeek[];
  today: string;
  weekStartDay: number;
}

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
  const limit = muscleWeeks.length ? muscleWeeks.length - 1 : MAX_WEEKS_AGO;
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
