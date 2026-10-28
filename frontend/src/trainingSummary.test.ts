import { describe, expect, it } from 'vitest';
import {
  compactSetSummary,
  groupWorkoutsByWeek,
  mostTrainedExerciseId,
  niceTicks,
  recentStrengthRecords,
  sessionTemplateFor,
  trainingDayGrid,
  weekGroupLabel,
  weekStartFor,
  weeklyBestPoints,
  weeklyBodyweightAverages,
  weeklyTrainingTotals,
  workoutDisplayName,
} from './trainingSummary';
import type {
  Exercise,
  PersonalRecord,
  TrackedSet,
  TrackedWorkout,
  WorkoutCategory,
} from './types';

function exercise(id: string, name: string, kind: Exercise['kind'] = 'strength'): Exercise {
  return {
    id,
    name,
    category: 'pull',
    kind,
    muscle_group: 'Back',
    equipment: 'Barbell',
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
  };
}

function trackedSet(weight: number, reps: number, extra: Partial<TrackedSet> = {}): TrackedSet {
  return {
    id: crypto.randomUUID(),
    order_index: 0,
    reps,
    weight_kg: weight,
    rpe: null,
    rest_seconds: null,
    duration_seconds: null,
    distance_km: null,
    incline_percent: null,
    speed_kph: null,
    bodyweight_kg: null,
    percentile: null,
    warmup: false,
    set_type: 'normal',
    failed: false,
    target_reps: null,
    notes: null,
    completed: true,
    ...extra,
  };
}

function workout(
  id: string,
  date: string,
  category: WorkoutCategory,
  movements: Array<{ exercise: Exercise; sets: TrackedSet[] }>,
  name = `Imported workout · ${date}`,
): TrackedWorkout {
  return {
    id,
    name,
    workout_date: date,
    category,
    notes: null,
    duration_minutes: 60,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: `${date}T10:00:00Z`,
    updated_at: `${date}T10:00:00Z`,
    movements: movements.map((movement, index) => ({
      id: `${id}-${index}`,
      order_index: index,
      notes: null,
      exercise: movement.exercise,
      sets: movement.sets,
      machine_photos: [],
      superset_group_id: null,
      superset_name: null,
    })),
  };
}

const deadlift = exercise('deadlift', 'Deadlift');
const row = exercise('row', 'Seated Cable Row');
const squat = exercise('squat', 'Back Squat');

const workouts = [
  workout('w3', '2026-10-05', 'lower', [
    {
      exercise: squat,
      sets: [trackedSet(60, 8, { warmup: true, set_type: 'warmup' }), trackedSet(125, 7)],
    },
  ]),
  workout('w2', '2026-10-03', 'pull', [
    {
      exercise: deadlift,
      sets: [trackedSet(157.5, 5), trackedSet(157.5, 5), trackedSet(157.5, 4)],
    },
    { exercise: row, sets: [trackedSet(68, 10)] },
  ]),
  workout('w1', '2026-09-26', 'pull', [{ exercise: deadlift, sets: [trackedSet(155, 5)] }]),
];

it('keeps custom-type templates separate from other custom and built-in Other sessions', () => {
  const a = {
    ...workout('a', '2026-10-01', 'other', [{ exercise: row, sets: [trackedSet(40, 8)] }]),
    workout_type_id: 'custom-a',
  };
  const b = { ...a, id: 'b', workout_date: '2026-10-02', workout_type_id: 'custom-b' };
  const other = { ...a, id: 'other', workout_date: '2026-10-03', workout_type_id: null };
  expect(
    sessionTemplateFor([a, b, other], 'other', '2026-10-04', 'kg', 'custom-a')?.sourceWorkout.id,
  ).toBe('a');
  expect(sessionTemplateFor([a, b, other], 'other', '2026-10-04')?.sourceWorkout.id).toBe('other');
  expect(sessionTemplateFor([b, other], 'other', '2026-10-04', 'kg', 'custom-a')).toBeNull();
});

describe('training summary helpers', () => {
  it('finds week starts for Monday and Sunday weeks', () => {
    expect(weekStartFor('2026-10-06', 1)).toBe('2026-10-05');
    expect(weekStartFor('2026-10-05', 1)).toBe('2026-10-05');
    expect(weekStartFor('2026-10-06', 0)).toBe('2026-10-04');
  });

  it('totals working sets and volume per week, excluding warmups and future workouts', () => {
    const future = workout('future', '2026-10-09', 'push', [
      { exercise: row, sets: [trackedSet(50, 10)] },
    ]);
    const weeks = weeklyTrainingTotals([...workouts, future], '2026-10-06', 1, 3);

    expect(weeks.map((week) => week.weekStart)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
    expect(weeks[2]).toMatchObject({ workouts: 1, sets: 1, volumeKg: 875 });
    expect(weeks[1]).toMatchObject({ workouts: 1, sets: 4, volumeKg: 2885 });
    expect(weeks[0]).toMatchObject({ workouts: 1, sets: 1 });
  });

  it('counts cardio sessions per week, including cardio after strength', () => {
    const bike = exercise('bike', 'Bike', 'cardio');
    const treadmill = exercise('treadmill', 'Treadmill', 'cardio');
    const cardioSet = (seconds: number | null, completed = true) =>
      trackedSet(0, 0, { weight_kg: null, reps: null, duration_seconds: seconds, completed });
    const sessions = [
      // Cardio-only workout: one session.
      workout('c1', '2026-10-06', 'cardio', [{ exercise: bike, sets: [cardioSet(1800)] }]),
      // Strength plus two cardio movements; one is under a minute and one is not completed.
      workout('c2', '2026-10-05', 'lower', [
        { exercise: squat, sets: [trackedSet(100, 5)] },
        { exercise: treadmill, sets: [cardioSet(600), cardioSet(900)] },
        { exercise: bike, sets: [cardioSet(45)] },
        { exercise: bike, sets: [cardioSet(1200, false)] },
      ]),
      workout('c3', '2026-09-30', 'pull', [{ exercise: row, sets: [trackedSet(68, 10)] }]),
    ];
    const weeks = weeklyTrainingTotals(sessions, '2026-10-06', 1, 2);

    expect(weeks.map((week) => week.cardioSessions)).toEqual([0, 2]);
    expect(weeks.map((week) => week.workouts)).toEqual([1, 2]);
  });

  it('averages body weight per week and leaves empty weeks null', () => {
    const entries = [
      { measurement_date: '2026-10-06', weight_kg: 80 },
      { measurement_date: '2026-10-05', weight_kg: 81 },
      { measurement_date: '2026-09-17', weight_kg: 83 },
      { measurement_date: '2026-09-10', weight_kg: 90 },
      { measurement_date: '2026-10-09', weight_kg: 70 },
    ];

    expect(weeklyBodyweightAverages(entries, '2026-10-06', 1, 4)).toEqual([83, null, null, 80.5]);
    expect(weeklyBodyweightAverages([], '2026-10-06', 1, 2)).toEqual([null, null]);
  });

  it('builds a week-by-day training grid ending in the current week', () => {
    const grid = trainingDayGrid(workouts, '2026-10-06', 1, 2);

    expect(grid).toHaveLength(2);
    expect(grid[0][0].date).toBe('2026-09-28');
    expect(grid[1][0]).toMatchObject({ date: '2026-10-05', sets: 1, categories: ['lower'] });
    expect(grid[1][2].future).toBe(true);
    expect(grid[0][5]).toMatchObject({ date: '2026-10-03', sets: 4 });
  });

  it('chooses clean 1/2/5 axis ticks', () => {
    expect(niceTicks(114.9, 159.3)).toEqual([110, 120, 130, 140, 150, 160]);
    expect(niceTicks(80.3, 84.6)).toEqual([80, 81, 82, 83, 84, 85]);
    expect(niceTicks(0, 150, 3)).toEqual([0, 50, 100, 150]);
  });

  it('names imported workouts by their type', () => {
    expect(workoutDisplayName({ name: 'Imported workout · 2026-10-05', category: 'lower' })).toBe(
      'Lower body',
    );
    expect(workoutDisplayName({ name: 'Heavy pulls', category: 'pull' })).toBe('Heavy pulls');
  });

  it('shows saved and imported mixed sessions in movement order without rewriting history', () => {
    const bike = { ...exercise('bike', 'Exercise bike', 'cardio'), category: 'cardio' as const };
    const bench = exercise('bench', 'Bench press');
    const saved = workout(
      'mixed',
      '2026-10-28',
      'upper',
      [
        { exercise: bike, sets: [trackedSet(0, 0)] },
        { exercise: bench, sets: [trackedSet(80, 8)] },
      ],
      'Upper body + Cardio workout',
    );
    expect(workoutDisplayName(saved)).toBe('Cardio + Upper body workout');
    expect(saved.name).toBe('Upper body + Cardio workout');
    expect(workoutDisplayName({ ...saved, movements: [...saved.movements].reverse() })).toBe(
      'Upper body + Cardio workout',
    );
    expect(workoutDisplayName({ ...saved, name: 'Imported workout · 2026-10-28' })).toBe(
      'Cardio + Upper body',
    );
  });

  it('templates the next session from the newest workout of that type', () => {
    const template = sessionTemplateFor(workouts, 'pull', '2026-10-06');

    expect(template?.sourceWorkout.id).toBe('w2');
    expect(template?.exercises.map((item) => item.exercise.name)).toEqual([
      'Deadlift',
      'Seated Cable Row',
    ]);
    expect(template?.exercises[0].topSet).toMatchObject({ weight_kg: 157.5, reps: 5 });
    expect(sessionTemplateFor(workouts, 'push', '2026-10-06')).toBeNull();
  });

  it('converts template summaries when the unit changes and preserves the canonical source sets', () => {
    const before = structuredClone(workouts);
    const kg = sessionTemplateFor(workouts, 'pull', '2026-10-06', 'kg');
    const pounds = sessionTemplateFor(workouts, 'pull', '2026-10-06', 'lb');
    const kgAgain = sessionTemplateFor(workouts, 'pull', '2026-10-06', 'kg');

    expect(kg?.exercises[0].summary).toBe('157.5 kg × 5');
    expect(pounds?.exercises[0].summary).toBe('347.23 lb × 5');
    expect(pounds?.exercises[0].topSet?.weight_kg).toBe(157.5);
    expect(pounds?.sourceWorkout).toBe(kg?.sourceWorkout);
    expect(kgAgain?.exercises.map((item) => item.summary)).toEqual(
      kg?.exercises.map((item) => item.summary),
    );
    expect(workouts).toEqual(before);
  });

  it('keeps cardio duration and distance in their own units in a pound template', () => {
    const cardio = workout('cardio-template', '2026-10-05', 'cardio', [
      {
        exercise: exercise('bike', 'Bike', 'cardio'),
        sets: [
          trackedSet(0, 0, {
            weight_kg: null,
            reps: null,
            duration_seconds: 1800,
            distance_km: 4.8,
          }),
        ],
      },
    ]);
    expect(sessionTemplateFor([cardio], 'cardio', '2026-10-06', 'lb')?.exercises[0].summary).toBe(
      '30 min · 4.8 km',
    );
  });

  it('collapses repeated sets for the last-session summary', () => {
    expect(compactSetSummary(workouts[1].movements[0].sets)).toBe('157.5×5 ×2, 157.5×4');
    expect(compactSetSummary(workouts[0].movements[0].sets)).toBe('125×7');
  });

  it('groups history by week with labels relative to today', () => {
    const groups = groupWorkoutsByWeek(workouts, 1);

    expect(groups.map((group) => [group.weekStart, group.workouts.length])).toEqual([
      ['2026-10-05', 1],
      ['2026-09-28', 1],
      ['2026-09-21', 1],
    ]);
    expect(weekGroupLabel('2026-10-05', '2026-10-06', 1)).toBe('This week');
    expect(weekGroupLabel('2026-09-28', '2026-10-06', 1)).toBe('Last week');
    expect(weekGroupLabel('2026-09-21', '2026-10-06', 1)).toBe('21–27 Sep');
  });

  it('defaults progress to the most-trained strength exercise', () => {
    expect(mostTrainedExerciseId(workouts, '2026-10-06')).toBe('deadlift');
  });

  it('keeps the best point per week for strength trends', () => {
    const points = [
      { workout_date: '2026-09-30', value: 151 },
      { workout_date: '2026-10-03', value: 120 },
      { workout_date: '2026-10-05', value: 154 },
    ];
    expect(weeklyBestPoints(points, (point) => point.value)).toEqual([
      { workout_date: '2026-09-30', value: 151 },
      { workout_date: '2026-10-05', value: 154 },
    ]);
  });

  it('surfaces weight and volume records and ignores legacy estimated 1RM records', () => {
    const record = (
      id: string,
      date: string,
      type: PersonalRecord['record_type'],
    ): PersonalRecord => ({
      id,
      exercise_id: 'squat',
      workout_id: 'w3',
      set_id: 's',
      achieved_date: date,
      record_type: type,
      value: 100,
      unit: 'kg',
      normalized_weight: null,
      formula: null,
      exercise_name: 'Back Squat',
    });
    const records = [
      record('a', '2026-09-01', 'weight'),
      record('b', '2026-10-05', 'reps_at_weight'),
      record('c', '2026-10-05', 'weight'),
      record('d', '2026-10-05', 'estimated_1rm'),
    ];
    expect(recentStrengthRecords(records, 2).map((item) => item.id)).toEqual(['c', 'b']);
  });
});
