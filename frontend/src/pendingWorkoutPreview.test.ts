import { describe, expect, it } from 'vitest';
import {
  dashboardWithPreview,
  isPendingWorkoutId,
  pendingWorkoutPreview,
  previewIdForSaved,
  workoutsWithPreview,
} from './pendingWorkoutPreview';
import type { DashboardData, Exercise, TrackedWorkout, WorkoutSetInput } from './types';
import type { PendingWorkoutSave } from './workoutDraft';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';

const bench = {
  id: 'bench',
  name: 'Bench press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
} as Exercise;
const run = { ...bench, id: 'run', name: 'Run', category: 'cardio', kind: 'cardio' } as Exercise;

function set(overrides: Partial<WorkoutSetInput> = {}): WorkoutSetInput {
  return {
    reps: 5,
    weight_kg: 100,
    rpe: null,
    rest_seconds: null,
    duration_seconds: null,
    distance_km: null,
    notes: null,
    completed: true,
    ...overrides,
  };
}

function completion(overrides: Partial<PendingWorkoutSave> = {}): PendingWorkoutSave {
  return {
    userId: 'sample',
    finishedAt: Date.parse('2026-10-20T10:00:00Z'),
    workoutId: null,
    payload: {
      client_session_id: 'session-1',
      name: 'Push day',
      workout_date: '2026-10-20',
      category: 'push',
      workout_type_id: null,
      notes: null,
      duration_minutes: 45,
      start_time: null,
      end_time: null,
      movements: [
        {
          exercise_id: 'bench',
          notes: null,
          machine_photo_ids: [],
          sets: [
            set(),
            set(),
            set({ warmup: true, set_type: 'warmup' }),
            set({ completed: false }),
          ],
        },
      ],
    },
    ...overrides,
  };
}

function dashboard(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    workouts_this_week: 1,
    sets_this_week: 3,
    volume_this_week_kg: 1500,
    current_streak: 2,
    heatmap: [
      {
        workout_date: '2026-10-19',
        categories: ['pull'],
        workout_count: 1,
        set_count: 3,
        workouts: [],
      },
    ],
    weekly_days: [],
    weekly_sets: { week_start: '2026-10-19', week_end: '2026-10-25' },
    recent_workouts: [],
    history: {
      total_workouts: 10,
      first_workout_date: '2026-01-05',
      last_workout_date: '2026-10-19',
      has_sample_workouts: false,
    },
    ...overrides,
  } as unknown as DashboardData;
}

const preview = pendingWorkoutPreview(completion(), [bench, run], DEFAULT_WORKOUT_TYPES)!;

describe('the finished workout shown before the server confirms it', () => {
  it('builds the workout from the completion, with an id the server never issues', () => {
    expect(isPendingWorkoutId(preview.id)).toBe(true);
    expect(preview).toMatchObject({
      client_session_id: 'session-1',
      name: 'Push day',
      workout_date: '2026-10-20',
      duration_minutes: 45,
      is_sample: false,
    });
    expect(preview.movements[0].exercise).toBe(bench);
    expect(preview.movements[0].sets).toHaveLength(4);
    expect(new Set(preview.movements[0].sets.map((item) => item.id)).size).toBe(4);
  });

  it('keeps a resumed workout’s own id and is not shown without its exercises', () => {
    expect(
      pendingWorkoutPreview(completion({ workoutId: 'saved-1' }), [bench], DEFAULT_WORKOUT_TYPES)
        ?.id,
    ).toBe('saved-1');
    expect(pendingWorkoutPreview(completion(), [run], DEFAULT_WORKOUT_TYPES)).toBeNull();
  });

  it('matches the saved workout to the preview it replaces', () => {
    const saved = { id: 'saved-2', client_session_id: 'session-1' } as TrackedWorkout;
    expect(previewIdForSaved(saved, null)).toBe(preview.id);
    expect(previewIdForSaved(saved, 'saved-1')).toBe('saved-1');
  });

  it('adds the workout to history once, newest first', () => {
    const older = { ...preview, id: 'older', client_session_id: null, workout_date: '2026-10-19' };
    expect(workoutsWithPreview([older], preview).map((item) => item.id)).toEqual([
      preview.id,
      'older',
    ]);
    const alreadySaved = { ...preview, id: 'saved-2' };
    expect(workoutsWithPreview([alreadySaved], preview)).toEqual([alreadySaved]);
  });
});

describe('Home figures counted on this device', () => {
  it('counts a new workout in this week, the streak, the calendar and history totals', () => {
    const next = dashboardWithPreview(
      dashboard(),
      preview,
      DEFAULT_WORKOUT_TYPES,
      '2026-10-20',
      true,
    );
    expect(next.workouts_this_week).toBe(2);
    // Two working sets: the warm-up and the unticked set do not count.
    expect(next.sets_this_week).toBe(5);
    expect(next.volume_this_week_kg).toBe(2500);
    expect(next.current_streak).toBe(3);
    expect(next.heatmap.map((day) => day.workout_date)).toEqual(['2026-10-19', '2026-10-20']);
    expect(next.heatmap[1]).toMatchObject({
      categories: ['push'],
      workout_count: 1,
      set_count: 2,
      workouts: [{ id: preview.id, exercises: [{ exercise_name: 'Bench press', set_count: 2 }] }],
    });
    expect(next.weekly_days).toEqual([
      expect.objectContaining({
        workout_date: '2026-10-20',
        total_sets: 2,
        volume_kg: 1000,
        workout_names: ['Push day'],
      }),
    ]);
    expect(next.recent_workouts[0].id).toBe(preview.id);
    expect(next.history).toMatchObject({ total_workouts: 11, last_workout_date: '2026-10-20' });
  });

  it('adds a second workout to the same calendar day without extending the streak', () => {
    const today = dashboard({
      heatmap: [
        {
          workout_date: '2026-10-20',
          categories: ['pull'],
          workout_count: 1,
          set_count: 3,
          workouts: [],
        },
      ],
    });
    const next = dashboardWithPreview(today, preview, DEFAULT_WORKOUT_TYPES, '2026-10-20', true);
    expect(next.current_streak).toBe(2);
    expect(next.heatmap).toHaveLength(1);
    expect(next.heatmap[0]).toMatchObject({
      categories: ['full_body'],
      workout_count: 2,
      set_count: 5,
    });
  });

  it('does not count a workout the dashboard already includes, or count a resumed one twice', () => {
    const saved = { ...preview, id: 'saved-2' };
    const current = dashboard({ recent_workouts: [saved] });
    expect(dashboardWithPreview(current, preview, DEFAULT_WORKOUT_TYPES, '2026-10-20', true)).toBe(
      current,
    );

    const resumed = { ...preview, id: 'saved-1', client_session_id: null };
    const before = dashboard({ recent_workouts: [{ ...resumed, name: 'Old name' }] });
    const next = dashboardWithPreview(before, resumed, DEFAULT_WORKOUT_TYPES, '2026-10-20', false);
    expect(next.workouts_this_week).toBe(1);
    expect(next.history?.total_workouts).toBe(10);
    expect(next.recent_workouts.map((item) => item.name)).toEqual(['Push day']);
  });

  const day = (workout_date: string) => ({
    workout_date,
    categories: ['pull' as const],
    workout_count: 1,
    set_count: 3,
    workouts: [],
  });

  it('leaves this week alone for a workout dated before it, and tolerates older dashboards', () => {
    const lastWeek = { ...preview, workout_date: '2026-10-12' };
    const next = dashboardWithPreview(
      dashboard({ heatmap: [day('2026-10-18'), day('2026-10-19')] }),
      lastWeek,
      DEFAULT_WORKOUT_TYPES,
      '2026-10-20',
      true,
    );
    expect(next.workouts_this_week).toBe(1);
    expect(next.current_streak).toBe(2);
    expect(
      dashboardWithPreview(
        { recommendation: null } as unknown as DashboardData,
        preview,
        DEFAULT_WORKOUT_TYPES,
        '2026-10-20',
        true,
      ).heatmap,
    ).toHaveLength(1);
  });

  it('joins workouts finished offline on consecutive days into one streak', () => {
    // The server last saw Friday 16th; Saturday and Sunday were logged without a connection.
    const synced = dashboard({ current_streak: 0, heatmap: [day('2026-10-16')] });
    const saturday = {
      ...preview,
      id: 'pending:saturday',
      client_session_id: 'saturday',
      workout_date: '2026-10-17',
    };
    const sunday = {
      ...preview,
      id: 'pending:sunday',
      client_session_id: 'sunday',
      workout_date: '2026-10-18',
    };
    const next = [saturday, sunday].reduce(
      (current, workout) =>
        dashboardWithPreview(current, workout, DEFAULT_WORKOUT_TYPES, '2026-10-18', true),
      synced,
    );
    expect(next.current_streak).toBe(3);
    expect(next.history?.total_workouts).toBe(12);
    expect(next.recent_workouts.map((workout) => workout.id)).toEqual([
      'pending:sunday',
      'pending:saturday',
    ]);
  });
});
