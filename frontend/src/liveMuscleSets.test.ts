import { describe, expect, it } from 'vitest';
import { liveMuscleSets, type MuscleSetsWeek } from './liveMuscleSets';
import { createWorkoutSet } from './workoutSets';
import type { ActiveWorkoutDraft } from './workoutDraft';
import type { Exercise, TrackedWorkout } from './types';

const exercise: Exercise = {
  id: 'bench',
  name: 'Bench press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Pectorals',
  equipment: null,
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
  default_muscle_set_credits: [
    { muscle_name: 'Pectorals', sets: 1 },
    { muscle_name: 'Triceps', sets: 0.5 },
  ],
};
const set = {
  ...createWorkoutSet('strength'),
  key: 'set',
  set_type: 'normal' as const,
  reps: 8,
  warmup: false,
  completed: true,
};
const week: MuscleSetsWeek = {
  week_start: '2026-11-02',
  week_end: '2026-11-08',
  muscle_groups: [{ muscle_group: 'Pectorals', raw_sets: 2, contributions: [] }],
};
const draft: ActiveWorkoutDraft = {
  version: 1,
  startedAt: 1,
  updatedAt: 1,
  clientSessionId: 'session',
  name: 'Push workout',
  workoutDate: '2026-11-05',
  category: 'push',
  notes: '',
  movements: [
    {
      key: 'bench-row',
      exerciseId: 'bench',
      notes: '',
      machinePhotoIds: [],
      supersetKey: null,
      sets: [set],
    },
  ],
};
const project = (
  value: ActiveWorkoutDraft | null,
  ex = exercise,
  baseline = week,
  saved: TrackedWorkout[] = [],
) => liveMuscleSets(baseline, value, [ex], saved, '2026-11-05');
const totals = (value: MuscleSetsWeek) =>
  Object.fromEntries(value.muscle_groups.map((group) => [group.muscle_group, group.raw_sets]));

describe('live muscle set credits', () => {
  it('adds direct and partial credits without changing the saved baseline', () => {
    expect(totals(project(draft))).toEqual({ Pectorals: 3, Triceps: 0.5 });
    expect(week.muscle_groups[0].raw_sets).toBe(2);
    expect(project(draft).muscle_groups[1].contributions?.[0]).toMatchObject({
      workout_id: 'active-workout',
      movement_id: 'bench-row',
      working_sets: 1,
      set_credits: 0.5,
    });
  });
  it('counts only completed working sets, including drop and attempted sets with reps', () => {
    const sets = [
      set,
      { ...set, completed: false },
      { ...set, set_type: 'warmup' as const },
      { ...set, warmup: true },
      { ...set, failed: true, reps: 0 },
      { ...set, failed: true, reps: 2 },
      { ...set, set_type: 'drop' as const },
    ];
    expect(totals(project({ ...draft, movements: [{ ...draft.movements[0], sets }] }))).toEqual({
      Pectorals: 5,
      Triceps: 1.5,
    });
  });
  it('honors partial-credit settings for the logged week and excludes cardio', () => {
    expect(
      totals(
        project(draft, {
          ...exercise,
          partial_set_weeks: [
            { week_start: '2026-11-02', enabled: false },
            { week_start: '2026-11-09', enabled: true },
          ],
        }),
      ),
    ).toEqual({ Pectorals: 3 });
    expect(totals(project(draft, { ...exercise, kind: 'cardio' }))).toEqual({ Pectorals: 2 });
  });
  it('removes unticked/deleted sets and discarded workouts, and ignores future dates', () => {
    expect(totals(project({ ...draft, movements: [] }))).toEqual({ Pectorals: 2 });
    expect(
      totals(
        project({
          ...draft,
          movements: [{ ...draft.movements[0], sets: [{ ...set, completed: false }] }],
        }),
      ),
    ).toEqual({ Pectorals: 2 });
    expect(project(null)).toBe(week);
    expect(project({ ...draft, workoutDate: '2026-11-06' })).toBe(week);
    expect(project({ ...draft, workoutDate: '2026-10-31' })).toBe(week);
  });
  it('replaces saved contributions when resuming or awaiting save refresh, without double counting', () => {
    const baseline = project(draft);
    baseline.muscle_groups.forEach((group) =>
      group.contributions?.forEach((item) => {
        item.workout_id = 'saved';
      }),
    );
    expect(totals(project({ ...draft, resumingWorkoutId: 'saved' }, exercise, baseline))).toEqual({
      Pectorals: 3,
      Triceps: 0.5,
    });
    expect(
      totals(
        project(draft, exercise, baseline, [
          { id: 'saved', client_session_id: 'session', movements: [] } as unknown as TrackedWorkout,
        ]),
      ),
    ).toEqual({ Pectorals: 3, Triceps: 0.5 });
    expect(
      totals(project({ ...draft, resumingWorkoutId: 'saved', movements: [] }, exercise, baseline)),
    ).toEqual({ Pectorals: 2, Triceps: 0 });
  });
  it('updates a historical week and removes resumed credits from a changed date', () => {
    const previous = { ...week, week_start: '2026-10-26', week_end: '2026-11-01' };
    expect(totals(project({ ...draft, workoutDate: '2026-10-31' }, exercise, previous))).toEqual({
      Pectorals: 3,
      Triceps: 0.5,
    });
    const baseline = project(draft);
    expect(
      totals(
        project(
          { ...draft, resumingWorkoutId: 'active-workout', workoutDate: '2026-10-31' },
          exercise,
          baseline,
        ),
      ),
    ).toEqual({ Pectorals: 2, Triceps: 0 });
  });
  it('subtracts the original from an older cached dashboard without contribution details', () => {
    const baseline = {
      ...week,
      muscle_groups: [
        { muscle_group: 'Pectorals', raw_sets: 3 },
        { muscle_group: 'Triceps', raw_sets: 1.5 },
      ],
    };
    const saved = {
      id: 'saved',
      workout_date: draft.workoutDate,
      movements: [{ exercise, sets: [set] }],
    } as unknown as TrackedWorkout;
    expect(
      totals(project({ ...draft, resumingWorkoutId: 'saved' }, exercise, baseline, [saved])),
    ).toEqual({ Pectorals: 3, Triceps: 1.5 });
    expect(
      totals(
        project(
          { ...draft, resumingWorkoutId: 'saved', workoutDate: '2026-11-06' },
          exercise,
          baseline,
          [saved],
        ),
      ),
    ).toEqual({ Pectorals: 2, Triceps: 1 });
  });
});
