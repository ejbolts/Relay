import { describe, expect, it } from 'vitest';
import { calculateDraftPrs } from './workoutPr';
import { createWorkoutSet } from './workoutSets';
import type { WorkoutDraftMovement } from './workoutMovements';
import type { Exercise, TrackedWorkout, WorkoutSetInput } from './types';

const bench: Exercise = {
  id: 'bench',
  name: 'Barbell Bench Press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Pectorals',
  equipment: 'Barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const set = (
  weight_kg: number | null,
  reps: number | null,
  extra: Partial<WorkoutSetInput> = {},
) => ({
  ...createWorkoutSet('strength', undefined, false),
  weight_kg,
  reps,
  completed: true,
  ...extra,
});
function draft(sets: WorkoutSetInput[], exercise = bench, key = 'movement'): WorkoutDraftMovement {
  return {
    key,
    exercise,
    notes: '',
    machinePhotoIds: [],
    machinePhotosInitialized: true,
    supersetKey: null,
    isComplete: false,
    sets: sets.map((item, index) => ({ ...item, key: `${key}-${index}` })),
  };
}
function history(
  sets: WorkoutSetInput[],
  id = 'prior',
  date = '2026-01-01',
  exercise = bench,
): TrackedWorkout {
  return {
    id,
    name: 'Sample workout',
    workout_date: date,
    category: 'push',
    notes: null,
    duration_minutes: 30,
    start_time: null,
    end_time: null,
    is_sample: true,
    created_at: `${date}T10:00:00Z`,
    updated_at: `${date}T10:00:00Z`,
    movements: [
      {
        id: 'm',
        order_index: 0,
        exercise,
        notes: null,
        machine_photos: [],
        superset_group_id: null,
        superset_name: null,
        sets: sets.map((item, index) => ({
          ...item,
          id: `s${index}`,
          order_index: index,
          incline_percent: null,
          speed_kph: null,
          bodyweight_kg: null,
          percentile: null,
          warmup: item.warmup ?? false,
          set_type: item.set_type ?? 'normal',
          failed: item.failed ?? false,
          target_reps: item.target_reps ?? null,
        })),
      },
    ],
  };
}
const baseline = history([set(100, 8), set(90, 12), set(80, 10)]);
const labels = (
  sets: WorkoutSetInput[],
  workouts = [baseline],
  excluded: string | null = null,
  date = '2026-01-15',
) => [
  ...(calculateDraftPrs([draft(sets)], workouts, excluded, date)
    .get('movement')
    ?.values() ?? []),
];

describe('exercise weight and volume PRs', () => {
  it.each([
    ['heavier with fewer reps', 105, 1, ['Weight PR']],
    ['more reps at the heaviest weight', 100, 9, ['Volume PR for this weight']],
    ['more reps at a lighter known weight', 90, 13, ['Volume PR for this weight']],
    ['more reps at another known weight', 80, 11, ['Volume PR for this weight']],
    ['tied reps and weight', 100, 8, []],
    ['fewer reps', 100, 7, []],
    ['new lighter weight with a higher estimated 1RM', 95, 30, []],
    ['first attempt at a lower weight', 70, 20, []],
    ['zero completed reps at a heavier weight', 110, 0, []],
    ['missing reps', 110, null, []],
    ['missing weight', null, 20, []],
  ] as const)('%s', (_name, weight, reps, expected) => {
    expect(labels([set(weight, reps)])).toEqual(expected.length ? [[...expected]] : []);
  });

  it.each([
    { completed: false },
    { set_type: 'warmup' as const },
    { warmup: true },
    { failed: true },
    { failed: true, target_reps: 10 },
  ])('excludes ineligible sets: %o', (extra) => {
    expect(labels([set(110, 9, extra)])).toEqual([]);
  });
  it('allows a failed set that met its target and drop sets', () => {
    expect(labels([set(100, 9, { failed: true, target_reps: 9 })])).toEqual([
      ['Volume PR for this weight'],
    ]);
    expect(labels([set(80, 11, { set_type: 'drop' })])).toEqual([['Volume PR for this weight']]);
  });
  it('establishes a first-exercise baseline without celebrating it', () => {
    expect(labels([set(100, 8)], [])).toEqual([]);
    expect(labels([set(100, 8), set(100, 9), set(105, 1)], [])).toEqual([
      ['Volume PR for this weight'],
      ['Weight PR'],
    ]);
  });
  it('uses the best at each weight, rather than the last or total reps', () => {
    expect(labels([set(100, 8), set(100, 8)], [history([set(100, 10), set(100, 5)])])).toEqual([]);
  });
  it('does not repeat a PR for a tied later set', () => {
    expect(labels([set(100, 9), set(100, 9), set(100, 10)])).toEqual([
      ['Volume PR for this weight'],
      ['Volume PR for this weight'],
    ]);
  });
  it('counts completed sets only as the baseline', () => {
    const prior = history([
      set(100, 8),
      set(120, 15, { warmup: true }),
      set(130, 1, { completed: false }),
    ]);
    expect(labels([set(105, 8)], [prior])).toEqual([['Weight PR']]);
  });
  it('keeps exercise IDs independent and shares a baseline across repeated movements', () => {
    const other = { ...bench, id: 'other' };
    expect(
      calculateDraftPrs([draft([set(110, 10)], other)], [baseline], null, '2026-01-15').get(
        'movement',
      )?.size,
    ).toBe(0);
    const result = calculateDraftPrs(
      [draft([set(100, 9)]), draft([set(100, 9)], bench, 'second')],
      [baseline],
      null,
      '2026-01-15',
    );
    expect(result.get('movement')?.size).toBe(1);
    expect(result.get('second')?.size).toBe(0);
  });
  it('ignores cardio duration and distance, including legacy weight fields', () => {
    const cardio = { ...bench, kind: 'cardio' as const };
    const result = calculateDraftPrs(
      [draft([set(150, 20, { duration_seconds: 3600, distance_km: 20 })], cardio)],
      [baseline],
      null,
      '2026-01-15',
    );
    expect(result.get('movement')?.size).toBe(0);
  });
  it('excludes the edited or resumed workout itself', () => {
    const own = history([set(100, 9)], 'own', '2026-01-15');
    expect(labels([set(100, 9)], [baseline, own], 'own')).toEqual([['Volume PR for this weight']]);
  });
  it('excludes later workouts when logging or editing an earlier date', () => {
    const future = history([set(150, 15)], 'future', '2026-02-01');
    expect(labels([set(105, 8)], [future, baseline])).toEqual([['Weight PR']]);
  });
  it('respects same-day creation order when editing', () => {
    const own = history([set(105, 8)], 'own', '2026-01-15');
    const later = {
      ...history([set(150, 15)], 'later', '2026-01-15'),
      created_at: '2026-01-15T12:00:00Z',
    };
    expect(labels([set(105, 8)], [baseline, own, later], 'own')).toEqual([['Weight PR']]);
  });
  it('recognizes bodyweight reps at zero added weight without awarding a zero weight PR', () => {
    expect(labels([set(0, 8)], [])).toEqual([]);
    expect(labels([set(0, 9)], [history([set(0, 8)])])).toEqual([['Volume PR for this weight']]);
  });
  it('keeps close but distinct weights separate and absorbs conversion noise', () => {
    expect(labels([set(100.04, 9)])).toEqual([['Weight PR']]);
    expect(labels([set(100.000001, 9)])).toEqual([['Volume PR for this weight']]);
    expect(labels([set(100.04, 9)], [history([set(100.05, 10)])])).toEqual([]);
  });

  it('compares with older history condensed by the server', () => {
    const older = new Map([
      [
        bench.id,
        {
          exercise_id: bench.id,
          best_weight_kg: 120,
          reps_by_weight: [
            { weight_kg: 100, reps: 10 },
            { weight_kg: 120, reps: 3 },
          ],
          latest: null,
        },
      ],
    ]);
    const withOlder = (sets: WorkoutSetInput[]) => [
      ...(calculateDraftPrs([draft(sets)], [baseline], null, '2026-01-15', older)
        .get('movement')
        ?.values() ?? []),
    ];
    // Loaded history alone would celebrate these; years-old bests outrank them.
    expect(withOlder([set(105, 1)])).toEqual([]);
    expect(withOlder([set(100, 9)])).toEqual([]);
    expect(withOlder([set(100, 11), set(125, 1), set(120, 4)])).toEqual([
      ['Volume PR for this weight'],
      ['Weight PR'],
      ['Volume PR for this weight'],
    ]);
    // Loaded workouts still count alongside it.
    expect(withOlder([set(90, 12)])).toEqual([]);
  });
});
