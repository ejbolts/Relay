import { describe, expect, it } from 'vitest';
import {
  bodyGoalProgress,
  distancePeriodStart,
  freshnessLabel,
  freshnessLevel,
  muscleFreshness,
  ordinal,
  spotlightSummary,
  weekStandings,
} from './homeInsights';
import type {
  BodyWeightGoal,
  ExerciseLibrarySummary,
  FriendActivity,
  TrackedWorkout,
} from './types';

const goal = (patch: Partial<BodyWeightGoal> = {}): BodyWeightGoal => ({
  id: 'g1',
  created_at: '2026-09-01T00:00:00Z',
  start_date: '2026-09-01',
  target_date: '2026-12-10',
  start_weight_kg: 90,
  target_weight_kg: 80,
  active: true,
  ...patch,
});

describe('bodyGoalProgress', () => {
  it('measures a loss against the straight line to the target date', () => {
    // Halfway through the 100 days, the line is at 85 kg.
    const ahead = bodyGoalProgress(goal(), 84, '2026-10-21');
    expect(ahead.kind).toBe('loss');
    expect(ahead.elapsed).toBeCloseTo(0.5);
    expect(ahead.done).toBeCloseTo(0.6);
    expect(ahead.ahead_kg).toBeCloseTo(1);
    expect(ahead.changed_kg).toBeCloseTo(6);
    expect(ahead.planned_kg).toBe(10);
    expect(ahead.days_left).toBe(50);
    expect(bodyGoalProgress(goal(), 86.5, '2026-10-21').ahead_kg).toBeCloseTo(-1.5);
    expect(bodyGoalProgress(goal(), 85.05, '2026-10-21').ahead_kg).toBe(0);
  });

  it('treats a gain as ahead above the line and clamps progress', () => {
    const gain = goal({ start_weight_kg: 70, target_weight_kg: 74 });
    const progress = bodyGoalProgress(gain, 69, '2026-10-21');
    expect(progress.kind).toBe('gain');
    expect(progress.done).toBe(0);
    expect(progress.changed_kg).toBe(0);
    expect(progress.ahead_kg).toBeCloseTo(-3);
    const past = bodyGoalProgress(gain, 75, '2027-01-01');
    expect(past.done).toBe(1);
    expect(past.elapsed).toBe(1);
    expect(past.days_left).toBe(0);
  });

  it('reports a maintenance range as below, in or above it', () => {
    const maintain = goal({ maintenance_min_kg: 79, maintenance_max_kg: 81, target_weight_kg: 80 });
    expect(bodyGoalProgress(maintain, 80, '2026-10-21')).toMatchObject({
      kind: 'maintain',
      done: null,
      status: 'in',
      range: [79, 81],
    });
    expect(bodyGoalProgress(maintain, 78, '2026-10-21').status).toBe('below');
    expect(bodyGoalProgress(maintain, 82, '2026-10-21').status).toBe('above');
  });
});

describe('spotlightSummary', () => {
  const summary = (id: string, sessions: number, latest: number | null = 100) =>
    ({
      exercise_id: id,
      session_count: sessions,
      last_date: '2026-11-10',
      latest_estimated_1rm: latest,
      change_kg: null,
      change_percent: null,
      trend: [],
    }) as ExerciseLibrarySummary;

  it('uses the chosen lift, falling back to the most trained one with an estimate', () => {
    const items = [summary('bench', 4), summary('squat', 9), summary('curl', 12, null)];
    expect(spotlightSummary(items, 'bench')?.exercise_id).toBe('bench');
    expect(spotlightSummary(items, null)?.exercise_id).toBe('squat');
    expect(spotlightSummary(items, 'deleted')?.exercise_id).toBe('squat');
    expect(spotlightSummary(items, 'curl')?.exercise_id).toBe('squat');
    expect(spotlightSummary([], null)).toBeNull();
  });
});

const set = (patch = {}) => ({
  completed: true,
  set_type: 'normal',
  warmup: false,
  failed: false,
  reps: 8,
  ...patch,
});
const workout = (
  date: string,
  muscles: Record<string, string[]>,
  patch: Partial<TrackedWorkout> = {},
): TrackedWorkout =>
  ({
    id: `w-${date}`,
    workout_date: date,
    is_sample: false,
    movements: Object.entries(muscles).map(([exercise, names]) => ({
      id: `${date}-${exercise}`,
      exercise: {
        id: exercise,
        name: exercise,
        kind: 'strength',
        category: 'strength',
        muscle_group: names[0],
        muscle_set_credits: names.map((muscle_name) => ({ muscle_name, sets: 1 })),
      },
      sets: [set()],
    })),
    ...patch,
  }) as unknown as TrackedWorkout;

describe('muscleFreshness', () => {
  it('lists days since each muscle was last trained, most rested first', () => {
    const workouts = [
      workout('2026-11-16', { bench: ['Pectorals', 'Triceps'] }),
      workout('2026-11-13', { squat: ['Quadriceps', 'Glutes'], bench: ['Pectorals', 'Triceps'] }),
      workout('2026-11-15', { row: ['Lats'] }),
      // Older than the four-week window, so Calves is left out.
      workout('2026-10-01', { raise: ['Calves'] }),
    ];
    expect(
      muscleFreshness(workouts, '2026-11-17', 1).map((item) => [item.muscle, item.days]),
    ).toEqual([
      ['Glutes', 4],
      ['Quadriceps', 4],
      ['Lats', 2],
      ['Pectorals', 1],
      ['Triceps', 1],
    ]);
  });

  it('skips incomplete and warm-up sets and counts the workout in progress', () => {
    const skipped = workout('2026-11-16', { squat: ['Quadriceps'] });
    skipped.movements[0].sets = [set({ completed: false }), set({ warmup: true })] as never;
    const live = {
      week_start: '2026-11-16',
      week_end: '2026-11-22',
      muscle_groups: [
        {
          muscle_group: 'Hamstrings',
          raw_sets: 3,
          contributions: [
            {
              workout_id: 'active-workout',
              workout_name: 'Today',
              workout_date: '2026-11-17',
              movement_id: 'm',
              exercise_id: 'rdl',
              exercise_name: 'RDL',
              working_sets: 3,
              credit_per_set: 1,
              set_credits: 3,
            },
          ],
        },
      ],
    };
    expect(muscleFreshness([skipped], '2026-11-17', 1, { liveWeek: live })).toEqual([
      { muscle: 'Hamstrings', last_date: '2026-11-17', days: 0 },
    ]);
  });

  it('labels and grades the days', () => {
    expect([0, 1, 2, 5].map((days) => freshnessLabel(days))).toEqual([
      'Today',
      'Yesterday',
      '2 days',
      '5 days',
    ]);
    expect(freshnessLabel(1, true)).toBe('1 d');
    expect([0, 1, 2, 3].map(freshnessLevel)).toEqual(['recent', 'recent', 'recovering', 'fresh']);
  });
});

describe('weekStandings', () => {
  const friend = (id: string, dates: string[], recent: number) =>
    ({
      id,
      display_name: id,
      profile_photo_url: null,
      training_dates: dates,
      recent_workout_count: recent,
    }) as unknown as FriendActivity;

  it('ranks training days this week, then the last 30 days, leaving out sample workouts', () => {
    const rows = weekStandings(
      [
        friend('Alex', ['2026-11-15', '2026-11-16', '2026-11-17'], 9),
        friend('Sam', ['2026-11-16', '2026-11-17'], 12),
        friend('Jordan', ['2026-11-16', '2026-11-16'], 3),
      ],
      { id: 'you', display_name: 'Pat', profile_photo_url: null },
      [
        workout('2026-11-16', {}),
        workout('2026-11-17', {}),
        workout('2026-11-17', {}, { id: 'second' }),
        workout('2026-11-12', {}),
        workout('2026-11-17', {}, { id: 'sample', is_sample: true }),
      ],
      '2026-11-17',
      1,
    );
    // Sunday 15 November belongs to the week before when weeks start on Monday, and a date
    // repeated in the list is one training day.
    expect(rows.map((row) => [row.display_name, row.days, row.recent])).toEqual([
      ['Sam', 2, 12],
      ['Alex', 2, 9],
      ['Pat', 2, 4],
      ['Jordan', 1, 3],
    ]);
    expect(rows.find((row) => row.is_you)?.display_name).toBe('Pat');
  });

  it('formats ranks and picks the period start', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
    ]);
    expect(distancePeriodStart('week', '2026-11-17', 1)).toBe('2026-11-16');
    expect(distancePeriodStart('week', '2026-11-17', 0)).toBe('2026-11-15');
    expect(distancePeriodStart('month', '2026-11-17', 1)).toBe('2026-11-01');
  });
});
