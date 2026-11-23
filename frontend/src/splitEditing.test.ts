import { describe, expect, it } from 'vitest';
import {
  atPlannedMinimum,
  canPlanMore,
  hasSplitTemplate,
  legacySplitRoutine,
  moveSplitDay,
  newRoutineMovement,
  planFewer,
  planMore,
  routineFromTemplate,
  routineSaveError,
  shareSplitError,
  splitDayContribution,
  splitDaySummary,
  splitDayTotal,
  splitPreviewDayLabel,
  splitsActiveFirst,
  splitTypeNameError,
  swapPlannedExercise,
  withSplitDayType,
  withSplitProgress,
} from './splitEditing';
import { CARDIO_ROW, splitVolumeRows } from './splitTargets';
import { SPLIT_TEMPLATES } from './trainingSplit';
import type { Exercise, Routine, RoutineDay, TrainingSplit } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';

const exercise = (patch: Partial<Exercise> = {}): Exercise => ({
  id: 'bench',
  name: 'Bench press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: null,
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
  ...patch,
});
const run = exercise({ id: 'run', name: 'Run', kind: 'cardio', category: 'cardio' });
const type = (id: string) => DEFAULT_WORKOUT_TYPES.find((item) => item.id === id)!;
const day = (typeId: string | null, movements = [newRoutineMovement(exercise())]): RoutineDay => ({
  workout_type_id: typeId,
  workout_type: typeId ? type(typeId) : null,
  movements: typeId ? movements : [],
});
const routine = (patch: Partial<Routine> = {}): Routine => ({
  id: 'r1',
  name: 'Push / Pull',
  shared: false,
  days: [day('push'), day(null)],
  ...patch,
});

describe('split days', () => {
  it('summarises a day as the web lists it', () => {
    expect(splitDaySummary(day(null))).toBe('Rest');
    expect(splitDaySummary(day('push', []))).toBe('No exercises');
    expect(
      splitDaySummary(day('push', [newRoutineMovement(exercise()), newRoutineMovement(run)])),
    ).toBe('2 exercises · 3 sets · 30 min');
    expect(splitDayTotal(day('push'))).toBe('3 sets');
    expect(splitDayTotal(day(null))).toBe('');
  });

  it('says what a day adds to the selected volume row', () => {
    const push = day('push', [newRoutineMovement(exercise()), newRoutineMovement(run)]);
    expect(splitDayContribution(push, 'Chest')).toBe('+3 sets');
    expect(splitDayContribution(push, CARDIO_ROW)).toBe('30 min');
    expect(splitDayContribution(push, 'Back')).toBeNull();
    expect(splitDayContribution(day(null), 'Chest')).toBeNull();
  });

  it('moves days and clears exercises from a rest day', () => {
    const days = [day('push'), day(null), day('pull')];
    expect(moveSplitDay(days, 2, -1).map((item) => item.workout_type_id)).toEqual([
      'push',
      'pull',
      null,
    ]);
    expect(withSplitDayType(days[0], null)).toMatchObject({ workout_type_id: null, movements: [] });
    expect(withSplitDayType(days[0], type('pull')).movements).toHaveLength(1);
  });
});

describe('planned exercises', () => {
  it('steps sets and cardio minutes, removing at the minimum', () => {
    const bench = newRoutineMovement(exercise());
    expect(planMore(bench).sets).toHaveLength(4);
    expect(planFewer(bench)!.sets).toHaveLength(2);
    expect(planFewer({ ...bench, sets: bench.sets.slice(0, 1) })).toBeNull();
    const cardio = newRoutineMovement(run);
    expect(planMore(cardio).sets[0].duration_seconds).toBe(35 * 60);
    expect(planFewer(cardio)!.sets[0].duration_seconds).toBe(25 * 60);
    expect(
      atPlannedMinimum({ ...cardio, sets: [{ ...cardio.sets[0], duration_seconds: 300 }] }),
    ).toBe(true);
    expect(canPlanMore({ ...bench, sets: Array(50).fill(bench.sets[0]) })).toBe(false);
  });

  it('keeps sets when swapping to the same kind of exercise only', () => {
    const bench = { ...newRoutineMovement(exercise()), rep_range: { min: 8, max: 12 } };
    expect(swapPlannedExercise(bench, exercise({ id: 'dip' })).sets).toHaveLength(3);
    const swapped = swapPlannedExercise(bench, run);
    expect(swapped.sets).toHaveLength(1);
    expect(swapped.rep_range).toBeNull();
  });
});

describe('saving a split', () => {
  it('checks the name, workout days, sharing, weights and removed types in order', () => {
    const types = DEFAULT_WORKOUT_TYPES;
    expect(routineSaveError(routine({ name: ' ' }), types)).toBe('Enter a split name.');
    expect(routineSaveError(routine({ days: [day(null)] }), types)).toBe(
      'Include at least one workout day.',
    );
    expect(routineSaveError(routine({ shared: true, days: [day('push', [])] }), types)).toBe(
      'Add exercises to every workout day before sharing.',
    );
    const heavy = newRoutineMovement(exercise());
    heavy.sets[0] = { ...heavy.sets[0], weight_kg: 10001 };
    expect(routineSaveError(routine({ days: [day('push', [heavy])] }), types)).toBe(
      'Starting weights must be no more than 10,000 kg.',
    );
    const removed = types.map((item) => (item.id === 'push' ? { ...item, archived: true } : item));
    expect(routineSaveError(routine(), removed)).toBe(
      'Choose an active workout type for every workout day.',
    );
    expect(routineSaveError(routine(), types)).toBeNull();
  });

  it('asks for exercises before a split is shown on the profile', () => {
    expect(shareSplitError(routine({ days: [day('push', [])] }))).toMatch(/Add an exercise/);
    expect(shareSplitError(routine({ shared: true, days: [day('push', [])] }))).toBeNull();
  });

  it('refuses a new type name that is already used, removed types included', () => {
    expect(splitTypeNameError(' push ', DEFAULT_WORKOUT_TYPES)).toMatch(/already exists/);
    expect(splitTypeNameError('Arms', DEFAULT_WORKOUT_TYPES)).toBeNull();
  });
});

describe('the split library', () => {
  it('starts templates once, and a custom split on the first active type', () => {
    const ppl = SPLIT_TEMPLATES.find((item) => item.id === 'ppl')!;
    const fromTemplate = routineFromTemplate('ppl', DEFAULT_WORKOUT_TYPES);
    expect(fromTemplate.days.map((item) => item.workout_type_id)).toEqual(ppl.types);
    expect(hasSplitTemplate([{ ...fromTemplate, id: 'saved' }], ppl)).toBe(true);
    expect(routineFromTemplate('fbeod', DEFAULT_WORKOUT_TYPES).name).toBe('Full body / Rest');
    const custom = routineFromTemplate(
      'custom',
      DEFAULT_WORKOUT_TYPES.map((item) => ({ ...item, archived: item.id === 'upper' })),
    );
    expect(custom).toMatchObject({ id: '', name: 'My split' });
    expect(custom.days.map((item) => item.workout_type_id)).toEqual(['lower']);
  });

  it('shows a split from before the library as one, and the active split first', () => {
    const split: TrainingSplit = {
      name: 'Old split',
      enabled: true,
      start_date: '2026-11-01',
      steps: [{ workout_type_id: 'upper' }, { workout_type_id: null }],
    };
    const legacy = legacySplitRoutine(split, DEFAULT_WORKOUT_TYPES)!;
    expect(legacy.id).toBe('current-split');
    expect(legacy.days[0].workout_type?.name).toBe('Upper body');
    expect(legacySplitRoutine({ ...split, routine_id: 'r1' }, DEFAULT_WORKOUT_TYPES)).toBeNull();
    expect(splitsActiveFirst([routine({ id: 'a' }), routine({ id: 'b' })], 'b')[0].id).toBe('b');
  });

  it('takes the server progress only for the schedule still shown', () => {
    const shown: TrainingSplit = {
      name: 'Split',
      enabled: true,
      start_date: '2026-11-01',
      routine_id: 'r1',
      steps: [],
    };
    const fresh = { ...shown, next_step: 2 };
    expect(withSplitProgress(shown, fresh)?.next_step).toBe(2);
    expect(withSplitProgress(shown, { ...fresh, start_date: '2026-11-02' })).toBe(shown);
  });

  it('labels preview days', () => {
    expect(splitPreviewDayLabel(DEFAULT_WORKOUT_TYPES, null)).toBe('Rest');
    expect(splitPreviewDayLabel(DEFAULT_WORKOUT_TYPES, undefined)).toBe('Not started');
    expect(splitPreviewDayLabel(DEFAULT_WORKOUT_TYPES, 'gone')).toBe('Removed type');
    expect(splitPreviewDayLabel(DEFAULT_WORKOUT_TYPES, 'pull')).toBe('Pull');
  });
});

describe('weekly volume rows', () => {
  it('compares planned sets and cardio with the goals', () => {
    const days = [
      day('push', [newRoutineMovement(exercise()), newRoutineMovement(run)]),
      day(null),
    ];
    const volume = splitVolumeRows(days, 10, { Chest: 6 }, 60);
    expect(volume.rows).toEqual([
      expect.objectContaining({ key: 'Chest', value: 10.5, goal: 6, status: 'met' }),
    ]);
    expect(volume.cardio).toMatchObject({ key: CARDIO_ROW, value: 105, goal: 60, status: 'met' });
    expect(volume).toMatchObject({ cycleDays: 2, goals: 2, met: 2 });
    expect(splitVolumeRows([day(null)], 10, undefined, null).cardio).toBeNull();
  });
});
