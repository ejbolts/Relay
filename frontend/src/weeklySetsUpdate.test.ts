import { describe, expect, it } from 'vitest';
import {
  exerciseSetGains,
  shelfAfterExerciseComplete,
  shelfAfterSetUpdate,
  weeklySetGains,
} from './weeklySetsUpdate';
import type { WorkoutDraftMovement, WorkoutDraftSet } from './workoutMovements';
import { createWorkoutSet } from './workoutSets';
import type { MuscleSetsWeek } from './liveMuscleSets';
import type { Exercise } from './types';

const exercise = (credits: { muscle_name: string; sets: number }[]): Exercise =>
  ({
    id: 'back-extension',
    name: 'Back extension machine',
    category: 'lower',
    kind: 'strength',
    muscle_group: 'Lower back',
    equipment: 'Machine',
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
    muscle_set_credits: credits,
  }) as Exercise;

const week: MuscleSetsWeek = {
  week_start: '2026-11-02',
  week_end: '2026-11-08',
  muscle_groups: [
    { muscle_group: 'Lower back', raw_sets: 6, contributions: [] },
    { muscle_group: 'Glutes', raw_sets: 9.5, contributions: [] },
  ],
};

describe('weeklySetGains', () => {
  it('adds one set of credits to each live weekly total, largest credit first', () => {
    const gains = weeklySetGains(
      exercise([
        { muscle_name: 'Hamstrings', sets: 0.5 },
        { muscle_name: 'Glutes', sets: 0.5 },
        { muscle_name: 'Lower back', sets: 1 },
      ]),
      week,
      '2026-11-06',
      '2026-11-06',
    );
    expect(gains).toEqual([
      { muscle: 'Lower back', before: 6, gain: 1, after: 7 },
      { muscle: 'Glutes', before: 9.5, gain: 0.5, after: 10 },
      { muscle: 'Hamstrings', before: 0, gain: 0.5, after: 0.5 },
    ]);
  });

  it('keeps the three largest credits', () => {
    const gains = weeklySetGains(
      exercise([
        { muscle_name: 'Quads', sets: 1 },
        { muscle_name: 'Adductors', sets: 0.5 },
        { muscle_name: 'Glutes', sets: 1 },
        { muscle_name: 'Lower back', sets: 0.5 },
      ]),
      week,
      '2026-11-06',
      '2026-11-06',
    );
    expect(gains.map((item) => item.muscle)).toEqual(['Glutes', 'Quads', 'Adductors']);
  });

  it('combines direct and partial credits across newly completed working sets', () => {
    const backExtension = exercise([
      { muscle_name: 'Lower back', sets: 1 },
      { muscle_name: 'Glutes', sets: 0.5 },
    ]);
    expect(weeklySetGains(backExtension, week, '2026-11-06', '2026-11-06', 3)).toEqual([
      { muscle: 'Lower back', before: 6, gain: 3, after: 9 },
      { muscle: 'Glutes', before: 9.5, gain: 1.5, after: 11 },
    ]);
    expect(weeklySetGains(backExtension, week, '2026-11-06', '2026-11-06', 0)).toEqual([]);
  });

  it('shows nothing for a workout outside the live week or without one', () => {
    const backExtension = exercise([{ muscle_name: 'Lower back', sets: 1 }]);
    expect(weeklySetGains(backExtension, week, '2026-11-01', '2026-11-06')).toEqual([]);
    expect(weeklySetGains(backExtension, week, '2026-11-07', '2026-11-06')).toEqual([]);
    expect(weeklySetGains(backExtension, undefined, '2026-11-06', '2026-11-06')).toEqual([]);
  });
});

describe('exerciseSetGains', () => {
  const credits = exercise([
    { muscle_name: 'Lower back', sets: 1 },
    { muscle_name: 'Glutes', sets: 0.5 },
  ]);

  it('covers every set of the exercise, taking the earlier ones back off the starting total', () => {
    // The live week (6 and 9.5) already counts two earlier sets; a third is ticked now.
    expect(exerciseSetGains(credits, week, '2026-11-06', '2026-11-06', 2, 1)).toEqual([
      { muscle: 'Lower back', before: 4, gain: 3, after: 7 },
      { muscle: 'Glutes', before: 8.5, gain: 1.5, after: 10 },
    ]);
  });

  it('shows the earlier sets when the last tick is a warm-up, and nothing with no working sets', () => {
    expect(exerciseSetGains(credits, week, '2026-11-06', '2026-11-06', 2, 0)).toEqual([
      { muscle: 'Lower back', before: 4, gain: 2, after: 6 },
      { muscle: 'Glutes', before: 8.5, gain: 1, after: 9.5 },
    ]);
    expect(exerciseSetGains(credits, week, '2026-11-06', '2026-11-06', 0, 0)).toEqual([]);
  });

  it('never starts below zero when the week has not caught up with the earlier sets', () => {
    const empty = { ...week, muscle_groups: [] };
    expect(exerciseSetGains(credits, empty, '2026-11-06', '2026-11-06', 2, 1)).toEqual([
      { muscle: 'Lower back', before: 0, gain: 3, after: 3 },
      { muscle: 'Glutes', before: 0, gain: 1.5, after: 1.5 },
    ]);
  });
});

describe('the shelf after a set changes', () => {
  const backExtension = exercise([{ muscle_name: 'Lower back', sets: 1 }]);
  const set = (key: string, values: Partial<WorkoutDraftSet> = {}): WorkoutDraftSet => ({
    ...createWorkoutSet('strength', undefined, false),
    key,
    reps: 10,
    weight_kg: 40,
    ...values,
  });
  const movement = (sets: WorkoutDraftSet[]): WorkoutDraftMovement => ({
    key: 'm',
    exercise: backExtension,
    notes: '',
    machinePhotoIds: [],
    machinePhotosInitialized: true,
    supersetKey: null,
    isComplete: false,
    sets,
  });
  const live = movement([set('a', { completed: true }), set('b'), set('c')]);

  it('moves the totals by each working set as it is logged', () => {
    expect(
      shelfAfterSetUpdate(
        live,
        'b',
        { completed: true },
        { loggingSet: true, finishesExercise: false },
        week,
        '2026-11-06',
        '2026-11-06',
      ),
    ).toEqual([{ muscle: 'Lower back', before: 6, gain: 1, after: 7 }]);
  });

  it("shows the whole exercise's sets when its last one is ticked, and hides on untick", () => {
    expect(
      shelfAfterSetUpdate(
        live,
        'c',
        { completed: true },
        { loggingSet: true, finishesExercise: true },
        week,
        '2026-11-06',
        '2026-11-06',
      ),
    ).toEqual([{ muscle: 'Lower back', before: 5, gain: 2, after: 7 }]);
    expect(
      shelfAfterSetUpdate(
        live,
        'a',
        { completed: false },
        { loggingSet: false, finishesExercise: false },
        week,
        '2026-11-06',
        '2026-11-06',
      ),
    ).toBe('hide');
    // A warm-up, or a workout outside the week, changes nothing shown.
    expect(
      shelfAfterSetUpdate(
        movement([set('w', { set_type: 'warmup', warmup: true })]),
        'w',
        { completed: true },
        { loggingSet: true, finishesExercise: false },
        week,
        '2026-11-06',
        '2026-11-06',
      ),
    ).toBeNull();
    expect(
      shelfAfterSetUpdate(
        live,
        'b',
        { completed: true },
        { loggingSet: true, finishesExercise: false },
        week,
        '2026-11-12',
        '2026-11-12',
      ),
    ).toBeNull();
  });

  it('counts the sets Finish exercise ticks', () => {
    const done = live.sets.map((item) => ({ ...item, completed: true }));
    expect(shelfAfterExerciseComplete(live, done, week, '2026-11-06', '2026-11-06')).toEqual([
      { muscle: 'Lower back', before: 5, gain: 3, after: 8 },
    ]);
    expect(
      shelfAfterExerciseComplete(live, live.sets, week, '2026-11-06', '2026-11-06'),
    ).toBeNull();
  });
});
