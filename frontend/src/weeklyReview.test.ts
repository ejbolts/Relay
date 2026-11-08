import { describe, expect, it } from 'vitest';
import { weeklyReview, type WeeklyReviewInput } from './weeklyReview';
import { reviewCardioWeek, reviewRecord, reviewSet, reviewWorkout } from './weeklyReviewFixtures';

// Sunday 8 Nov 2026, with Monday-start weeks: this week is 2–8 Nov, last week 26 Oct – 1 Nov.
const base: WeeklyReviewInput = {
  workouts: [],
  records: [],
  measurements: [],
  muscleWeeks: [],
  muscleGoal: 10,
  cardioWeeks: [],
  today: '2026-11-08',
  weekStartDay: 1,
  weeksAgo: 0,
};
const week = (muscle_groups: Array<[string, number]>) => ({
  week_start: '2026-11-02',
  week_end: '2026-11-08',
  muscle_groups: muscle_groups.map(([muscle_group, raw_sets]) => ({
    muscle_group,
    raw_sets,
    contributions: [],
  })),
});

describe('weeklyReview', () => {
  it('totals performed sets for the week against the week before', () => {
    const review = weeklyReview({
      ...base,
      workouts: [
        reviewWorkout('this', '2026-11-03', [
          reviewSet(100, 5),
          reviewSet(100, 5),
          reviewSet(40, 10, { warmup: true, set_type: 'warmup' }),
          reviewSet(100, 5, { completed: false }),
        ]),
        reviewWorkout('last', '2026-10-28', [reviewSet(90, 5)]),
        reviewWorkout('future', '2026-11-09', [reviewSet(100, 5)]),
        reviewWorkout('older', '2026-10-20', [reviewSet(100, 5)]),
      ],
    });
    expect(review.weekStart).toBe('2026-11-02');
    expect(review.weekEnd).toBe('2026-11-08');
    expect(review.complete).toBe(true);
    expect(review.training).toMatchObject({ workouts: 1, sets: 2, volumeKg: 1000 });
    expect(review.previousTraining).toMatchObject({ workouts: 1, sets: 1, volumeKg: 450 });
  });

  it('steps back a week and marks the running week as incomplete', () => {
    const workouts = [reviewWorkout('last', '2026-10-28', [reviewSet(90, 5)])];
    expect(weeklyReview({ ...base, today: '2026-11-05', workouts }).complete).toBe(false);
    const earlier = weeklyReview({ ...base, workouts, weeksAgo: 1 });
    expect(earlier.weekStart).toBe('2026-10-26');
    expect(earlier.training.workouts).toBe(1);
    expect(earlier.previousTraining.workouts).toBe(0);
  });

  it('lists each strength record once and compares the count', () => {
    const review = weeklyReview({
      ...base,
      records: [
        reviewRecord('a', '2026-11-03', { value: 100 }),
        reviewRecord('b', '2026-11-05', { value: 105 }),
        reviewRecord('c', '2026-11-05', { record_type: 'estimated_1rm', value: 130 }),
        reviewRecord('d', '2026-11-04', { exercise_id: 'squat', exercise_name: 'Squat' }),
        reviewRecord('e', '2026-10-29'),
        reviewRecord('f', '2026-10-30', { exercise_id: 'row' }),
        reviewRecord('g', '2026-10-20'),
      ],
    });
    expect(review.records.map((record) => record.id).sort()).toEqual(['b', 'd']);
    expect(review.previousRecordCount).toBe(2);
  });

  it('counts muscles at goal and surfaces the biggest changes', () => {
    const review = weeklyReview({
      ...base,
      muscleWeeks: [
        week([
          ['Chest', 12],
          ['Back', 10],
          ['Calves', 2],
        ]),
        week([
          ['Chest', 6],
          ['Back', 14],
          ['Biceps', 4],
        ]),
      ],
    });
    expect(review.muscles).toMatchObject({
      goal: 10,
      atGoal: 2,
      previousAtGoal: 1,
      totalSets: 24,
      previousTotalSets: 24,
    });
    expect(review.muscles?.movers).toEqual([
      { muscle: 'Chest', sets: 12, change: 6 },
      { muscle: 'Back', sets: 10, change: -4 },
      { muscle: 'Biceps', sets: 0, change: -4 },
    ]);
  });

  it('has no muscle review without set data, and no comparison without an earlier week', () => {
    expect(weeklyReview(base).muscles).toBeNull();
    const only = weeklyReview({ ...base, muscleWeeks: [week([['Chest', 10]])] }).muscles;
    expect(only).toMatchObject({ atGoal: 1, previousAtGoal: null, previousTotalSets: null });
    expect(only?.movers).toEqual([]);
  });

  it('reads zone minutes against each goal from the dashboard weeks', () => {
    expect(weeklyReview(base).cardio).toBeNull();
    const review = weeklyReview({
      ...base,
      cardioWeeks: [
        reviewCardioWeek('2026-11-02', 110, { 4: [15, 20], 2: [70, 150] }),
        reviewCardioWeek('2026-10-26', 60, { 2: [60, 150] }),
      ],
    });
    expect(review.cardio).toEqual({
      totalMinutes: 110,
      previousTotalMinutes: 60,
      zones: [
        { zone: 2, minutes: 70, previousMinutes: 60, goalMinutes: 150 },
        { zone: 4, minutes: 15, previousMinutes: 0, goalMinutes: 20 },
      ],
    });
  });

  it('follows the selected week through the cardio weeks, with no comparison past the data', () => {
    const cardioWeeks = [
      reviewCardioWeek('2026-11-02', 110, { 2: [70, 150] }),
      reviewCardioWeek('2026-10-26', 60, { 2: [60, 150] }),
    ];
    expect(weeklyReview({ ...base, cardioWeeks, weeksAgo: 1 }).cardio).toEqual({
      totalMinutes: 60,
      previousTotalMinutes: null,
      zones: [{ zone: 2, minutes: 60, previousMinutes: null, goalMinutes: 150 }],
    });
    expect(weeklyReview({ ...base, cardioWeeks, weeksAgo: 2 }).cardio).toBeNull();
  });

  it('averages body weight per week', () => {
    const review = weeklyReview({
      ...base,
      measurements: [
        { measurement_date: '2026-11-03', weight_kg: 80 },
        { measurement_date: '2026-11-07', weight_kg: 81 },
        { measurement_date: '2026-10-29', weight_kg: 82 },
      ],
    });
    expect(review.body).toEqual({ averageKg: 80.5, previousAverageKg: 82, checkIns: 2 });
    expect(weeklyReview(base).body).toEqual({
      averageKg: null,
      previousAverageKg: null,
      checkIns: 0,
    });
  });
});
