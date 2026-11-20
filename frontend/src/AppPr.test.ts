import { describe, expect, it } from 'vitest';
import { calculateDraftPrs, calculateScopedDraftPrs, prToastLines } from './workoutPr';
import { createWorkoutSet } from './workoutSets';
import type { WorkoutDraftMovement } from './workoutMovements';
import type { Exercise, ExerciseHistoryBaseline, TrackedWorkout, WorkoutSetInput } from './types';

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

describe('relative strength PRs', () => {
  it('rewards a better ratio without requiring a heavier weight or more reps', () => {
    expect(
      labels(
        [set(100, 8, { bodyweight_kg: 80 })],
        [history([set(100, 8, { bodyweight_kg: 100 })])],
      ),
    ).toEqual([['Relative strength PR']]);
    expect(
      labels([set(90, 8, { bodyweight_kg: 72 })], [history([set(100, 8, { bodyweight_kg: 80 })])]),
    ).toEqual([]);
    expect(labels([set(100, 8, { bodyweight_kg: 80 })], [history([set(100, 8)])])).toEqual([]);
  });

  it('uses dated check-ins for history without snapshots and respects older baselines', () => {
    const measurements = [
      { measurement_date: '2026-01-01', weight_kg: 100 },
      { measurement_date: '2026-01-15', weight_kg: 80 },
      { measurement_date: '2026-01-20', weight_kg: 70 },
    ].map((measurement) => ({
      ...measurement,
      id: measurement.measurement_date,
      body_fat_pct: null,
      notes: null,
      is_sample: false,
      created_at: '',
    }));
    const result = calculateDraftPrs(
      [draft([set(100, 8)])],
      [history([set(100, 8)])],
      null,
      '2026-01-15',
      null,
      measurements,
    );
    expect([...result.get('movement')!.values()]).toEqual([['Relative strength PR']]);
    const older = new Map([
      [
        bench.id,
        {
          exercise_id: bench.id,
          best_weight_kg: 100,
          reps_by_weight: [{ weight_kg: 100, reps: 8 }],
          best_relative_strength: 1.3,
          latest: null,
        },
      ],
    ]);
    expect([
      ...calculateDraftPrs([draft([set(100, 8)])], [], null, '2026-01-15', older, measurements)
        .get('movement')!
        .values(),
    ]).toEqual([]);
  });

  it('distinguishes block records and celebrates an all-time record once', () => {
    const blocks = [{ id: 'block', name: 'Rebuild', start_date: '2026-01-10', end_date: null }];
    const workouts = [
      history([set(100, 8, { bodyweight_kg: 70 })]),
      history([set(100, 8, { bodyweight_kg: 100 })], 'recent', '2026-01-10'),
    ];
    const result = calculateScopedDraftPrs(
      [draft([set(100, 8, { bodyweight_kg: 80 })])],
      workouts,
      null,
      '2026-01-15',
      null,
      blocks,
    );
    expect([...result.get('movement')!.values()]).toEqual([['Block relative strength PR']]);
    const lifetime = calculateScopedDraftPrs(
      [draft([set(100, 8, { bodyweight_kg: 60 })])],
      workouts,
      null,
      '2026-01-15',
      null,
      blocks,
    );
    expect([...lifetime.get('movement')!.values()]).toEqual([['All-time relative strength PR']]);
  });
});

describe('fresh start PRs', () => {
  const workouts = [history([set(120, 8)]), history([set(90, 8)], 'since', '2026-06-01')];
  const scoped = (
    weight: number,
    blocks: Parameters<typeof calculateScopedDraftPrs>[5] = [],
    freshStarts = ['2026-06-01'],
    date = '2026-06-10',
    history = workouts,
    older: Map<string, ExerciseHistoryBaseline> | null = null,
  ) => [
    ...calculateScopedDraftPrs(
      [draft([set(weight, 8)])],
      history,
      null,
      date,
      older,
      blocks,
      [],
      freshStarts,
    )
      .get('movement')!
      .values(),
  ];

  it('compares with lifts since the fresh start without training blocks', () => {
    expect(scoped(95)).toEqual([['Fresh start weight PR']]);
    expect(scoped(125)).toEqual([['All-time weight PR']]);
    expect(scoped(90)).toEqual([]);
    expect(scoped(95, [], [])).toEqual([]);
    // A workout dated before the fresh start only compares with all history.
    expect(scoped(95, [], ['2026-06-01'], '2026-05-20')).toEqual([]);
  });

  it('gives each fresh start its own baseline until the next one', () => {
    const periods = [...workouts, history([set(100, 8)], 'june', '2026-06-05')];
    const both = ['2026-06-01', '2026-08-01'];
    const withAugust = [...periods, history([set(70, 8)], 'august', '2026-08-01')];
    // In August only lifts since 1 Aug count, so 80 kg beats 70 kg despite June's 100 kg.
    expect(scoped(80, [], both, '2026-08-10', withAugust)).toEqual([['Fresh start weight PR']]);
    // Editing a July workout compares with June's fresh start, which excludes August.
    expect(scoped(105, [], both, '2026-07-10', withAugust)).toEqual([['Fresh start weight PR']]);
    expect(scoped(95, [], both, '2026-07-10', withAugust)).toEqual([]);
  });

  it('names a record by its broadest scope when a block also applies', () => {
    const lateBlock = [{ id: 'block', name: 'Rebuild', start_date: '2026-06-05', end_date: null }];
    expect(scoped(95, lateBlock)).toEqual([['Fresh start weight PR']]);
    // The early block's 100 kg stands, but the lift beats everything since the fresh start.
    const earlyBlock = [{ id: 'block', name: 'Rebuild', start_date: '2026-05-01', end_date: null }];
    const withBlockLift = [...workouts, history([set(100, 8)], 'block', '2026-05-02')];
    expect(scoped(95, earlyBlock, ['2026-06-01'], '2026-06-10', withBlockLift)).toEqual([
      ['Fresh start weight PR'],
    ]);
    expect(scoped(105, earlyBlock, [], '2026-06-10', withBlockLift)).toEqual([['Block weight PR']]);
  });

  it('uses the server-condensed bests since the fresh start', () => {
    const older = new Map<string, ExerciseHistoryBaseline>([
      [
        bench.id,
        {
          exercise_id: bench.id,
          best_weight_kg: 120,
          reps_by_weight: [{ weight_kg: 120, reps: 8 }],
          fresh_start_bests: [
            {
              start_date: '2026-03-01',
              best_weight_kg: 110,
              reps_by_weight: [{ weight_kg: 110, reps: 8 }],
            },
            {
              start_date: '2026-06-01',
              best_weight_kg: 100,
              reps_by_weight: [{ weight_kg: 100, reps: 8 }],
            },
          ],
          latest: null,
        },
      ],
    ]);
    const starts = ['2026-03-01', '2026-06-01'];
    expect(scoped(105, [], starts, '2026-06-10', [], older)).toEqual([['Fresh start weight PR']]);
    expect(scoped(100, [], starts, '2026-06-10', [], older)).toEqual([]);
    // March's fresh start has its own bests.
    expect(scoped(105, [], starts, '2026-04-10', [], older)).toEqual([]);
  });
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
          bodyweight_kg: item.bodyweight_kg ?? null,
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

describe('training-block PR scopes', () => {
  const blocks = [{ id: 'block', name: 'Rebuild', start_date: '2026-01-10', end_date: null }];
  const scoped = (
    sets: WorkoutSetInput[],
    workouts: TrackedWorkout[],
    date = '2026-01-15',
    older?: Map<string, ExerciseHistoryBaseline>,
  ) => [
    ...(calculateScopedDraftPrs([draft(sets)], workouts, null, date, older, blocks)
      .get('movement')
      ?.values() ?? []),
  ];
  it('keeps old all-time bests while rewarding improvements within the block', () => {
    const recent = history([set(80, 8)], 'recent', '2026-01-10');
    expect(scoped([set(90, 8)], [baseline, recent])).toEqual([['Block weight PR']]);
    expect(scoped([set(105, 8)], [baseline, recent])).toEqual([['All-time weight PR']]);
    expect(scoped([set(80, 8)], [baseline])).toEqual([]);
  });
  it('uses condensed block history without importing lifetime bests', () => {
    const older = new Map<string, ExerciseHistoryBaseline>([
      [
        bench.id,
        {
          exercise_id: bench.id,
          best_weight_kg: 120,
          reps_by_weight: [{ weight_kg: 120, reps: 8 }],
          latest: null,
          block_bests: [
            { block_id: 'block', best_weight_kg: 80, reps_by_weight: [{ weight_kg: 80, reps: 8 }] },
          ],
        },
      ],
    ]);
    expect(scoped([set(85, 8)], [], '2026-01-15', older)).toEqual([['Block weight PR']]);
    expect(scoped([set(80, 9)], [], '2026-01-15', older)).toEqual([
      ['Block volume PR for this weight'],
    ]);
  });
  it('uses the workout date rather than the viewed/current block', () => {
    expect(scoped([set(105, 8)], [baseline], '2026-01-05')).toEqual([['All-time weight PR']]);
  });
});

describe('personal record toast lines', () => {
  it('names the records beaten, then the exercise and set', () => {
    expect(
      prToastLines(
        [{ exercise: 'Bench Press', labels: ['Weight PR', 'Volume PR'], reps: 9, weightKg: 100 }],
        'kg',
      ),
    ).toEqual([{ title: 'Weight PR + Volume PR', detail: 'Bench Press · 9 reps at 100 kg' }]);
  });

  it('adds the bodyweight context of a relative record, in the preferred unit', () => {
    const entry = {
      exercise: 'Bench Press',
      labels: ['Relative strength PR'],
      reps: 8,
      weightKg: 100,
      bodyweightKg: 80,
    };
    const [kg] = prToastLines([entry], 'kg');
    expect(kg.detail).toContain('1.25× BW');
    expect(kg.detail).toContain('at 80 kg BW');
    const [lb] = prToastLines([entry], 'lb');
    expect(lb.detail).toContain('8 reps at 220.46 lb');
    expect(lb.detail).not.toContain(' kg');
  });
});
