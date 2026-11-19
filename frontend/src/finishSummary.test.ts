// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildFinishSummary,
  FINISH_SUMMARY_MAX_AGE_MS,
  finishSummaryWorkoutGone,
  readFinishSummary,
  writeFinishSummary,
} from './finishSummary';
import { activeRoutineWithout, suggestedRepRange, withRepRange } from './routineRepRange';
import { REP_RANGE_PRESETS } from './repProgression';
import { createWorkoutSet } from './workoutSets';
import type { Exercise, Routine, TrackedWorkout, WorkoutInput } from './types';

const exercise = (id: string, name: string, kind: Exercise['kind'] = 'strength'): Exercise =>
  ({
    id,
    name,
    category: 'lower',
    kind,
    muscle_group: 'Quads',
    equipment: 'Machine',
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
  }) as Exercise;
const legPress = exercise('leg-press', 'Leg Press');
const extension = exercise('extension', 'Leg Extension');
const bike = exercise('bike', 'Cycling', 'cardio');

const set = (weight: number | null, reps: number | null, extra: object = {}) => ({
  // Not a first set, which would default to a warm-up.
  ...createWorkoutSet('strength', undefined, false),
  reps,
  weight_kg: weight,
  completed: true,
  ...extra,
});

function saved(
  id: string,
  date: string,
  movements: { exercise: Exercise; sets: [number, number][]; machine?: string }[],
  name = 'Lower body workout',
): TrackedWorkout {
  return {
    id,
    name,
    workout_date: date,
    category: 'lower',
    notes: null,
    duration_minutes: 50,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: `${date}T08:00:00Z`,
    updated_at: `${date}T08:00:00Z`,
    movements: movements.map((movement, index) => ({
      id: `${id}-${index}`,
      order_index: index,
      exercise: movement.exercise,
      notes: null,
      machine_photos: movement.machine ? [{ id: movement.machine }] : [],
      superset_group_id: null,
      superset_name: null,
      sets: movement.sets.map(([weight, reps], order) => ({
        ...set(weight, reps),
        id: `${id}-${index}-${order}`,
        order_index: order,
      })),
    })),
  } as unknown as TrackedWorkout;
}

function finished(
  movements: {
    exercise: Exercise;
    sets: ReturnType<typeof set>[];
    machine?: string;
  }[],
): WorkoutInput {
  return {
    client_session_id: 'session-1',
    name: 'Lower body workout',
    workout_date: '2026-11-17',
    category: 'lower',
    notes: null,
    duration_minutes: 55,
    start_time: null,
    end_time: null,
    movements: movements.map((movement) => ({
      exercise_id: movement.exercise.id,
      notes: null,
      machine_photo_ids: movement.machine ? [movement.machine] : [],
      sets: movement.sets,
    })),
  };
}

const exercises = [legPress, extension, bike];

describe('buildFinishSummary', () => {
  it('totals working sets and volume, leaving out warm-ups, unticked sets and cardio', () => {
    const summary = buildFinishSummary(
      finished([
        {
          exercise: legPress,
          sets: [
            set(60, 10, { set_type: 'warmup', warmup: true }),
            set(100, 8),
            set(100, 8),
            set(100, 6, { completed: false }),
          ],
        },
        { exercise: bike, sets: [set(null, null, { duration_seconds: 600 })] },
      ]),
      exercises,
      [],
      1000,
    );
    expect(summary).toMatchObject({
      sessionId: 'session-1',
      name: 'Lower body workout',
      durationMinutes: 55,
      // The two working sets, as history and the share card count them.
      sets: 2,
      volumeKg: 1600,
      previous: null,
      machineChanges: [],
      plateaus: [],
    });
  });

  it('compares with the last session of the same name', () => {
    const summary = buildFinishSummary(
      finished([{ exercise: legPress, sets: [set(100, 8), set(100, 8)] }]),
      exercises,
      [
        saved('other', '2026-11-16', [{ exercise: legPress, sets: [[90, 8]] }], 'Upper body'),
        saved('last', '2026-11-13', [
          {
            exercise: legPress,
            sets: [
              [90, 8],
              [90, 8],
              [90, 8],
            ],
          },
        ]),
      ],
      1000,
    );
    expect(summary.previous).toEqual({ workoutDate: '2026-11-13', sets: 3, volumeKg: 2160 });
  });

  it('compares completed sets with completed sets', () => {
    const last = saved('last', '2026-11-13', [
      {
        exercise: legPress,
        sets: [
          [90, 8],
          [90, 8],
          [90, 8],
        ],
      },
    ]);
    // A fourth set was planned last time and never done.
    last.movements[0].sets.push({
      ...last.movements[0].sets[0],
      id: 'unticked',
      order_index: 3,
      completed: false,
    });
    const summary = buildFinishSummary(
      finished([{ exercise: legPress, sets: [set(90, 8), set(90, 8), set(90, 8)] }]),
      exercises,
      [last],
      1000,
    );
    expect(summary.sets).toBe(3);
    expect(summary.previous?.sets).toBe(3);
  });

  it('notices an exercise logged on a different machine from its last session', () => {
    const history = [
      saved('last', '2026-11-13', [
        { exercise: legPress, sets: [[90, 8]], machine: 'hammer' },
        { exercise: extension, sets: [[50, 10]], machine: 'cybex' },
      ]),
    ];
    const summary = buildFinishSummary(
      finished([
        { exercise: legPress, sets: [set(120, 8)], machine: 'cybex' },
        { exercise: extension, sets: [set(50, 10)], machine: 'cybex' },
      ]),
      exercises,
      history,
      1000,
    );
    expect(summary.machineChanges).toEqual([
      { exerciseId: 'leg-press', exerciseName: 'Leg Press' },
    ]);
    // No machine today, or none before, is not a change.
    expect(
      buildFinishSummary(
        finished([{ exercise: legPress, sets: [set(120, 8)] }]),
        exercises,
        history,
        1000,
      ).machineChanges,
    ).toEqual([]);
  });

  it('notices a top set that matches the two sessions before it', () => {
    const stuck = (date: string, id: string) =>
      saved(id, date, [
        {
          exercise: extension,
          sets: [
            [72.5, 12],
            [72.5, 10],
          ],
        },
      ]);
    const today = finished([{ exercise: extension, sets: [set(72.5, 12), set(72.5, 11)] }]);
    expect(
      buildFinishSummary(today, exercises, [stuck('2026-11-13', 'a'), stuck('2026-11-10', 'b')], 1)
        .plateaus,
    ).toEqual([
      { exerciseId: 'extension', exerciseName: 'Leg Extension', weightKg: 72.5, reps: 12 },
    ]);
    // Two matching sessions are not yet a pattern, and progress breaks it.
    expect(buildFinishSummary(today, exercises, [stuck('2026-11-13', 'a')], 1).plateaus).toEqual(
      [],
    );
    expect(
      buildFinishSummary(
        today,
        exercises,
        [
          stuck('2026-11-13', 'a'),
          saved('b', '2026-11-10', [{ exercise: extension, sets: [[70, 12]] }]),
        ],
        1,
      ).plateaus,
    ).toEqual([]);
  });

  it('does not treat a resumed workout, or this workout once saved, as its own past', () => {
    const today = finished([{ exercise: extension, sets: [set(72.5, 12)] }]);
    const itself = {
      ...saved('resumed', '2026-11-17', [{ exercise: extension, sets: [[72.5, 12]] }]),
      client_session_id: 'session-1',
    };
    const before = saved('a', '2026-11-13', [{ exercise: extension, sets: [[72.5, 12]] }]);
    expect(buildFinishSummary(today, exercises, [itself, before], 1).plateaus).toEqual([]);
    expect(
      buildFinishSummary(
        { ...today, client_session_id: undefined },
        exercises,
        [{ ...itself, client_session_id: null }, before],
        1,
        'resumed',
      ).plateaus,
    ).toEqual([]);
  });
});

describe('finish summary of a deleted workout', () => {
  const summary = buildFinishSummary(finished([]), exercises, [], 1);
  const synced = { id: 'w1', client_session_id: 'session-1' };

  it('is gone once the synced workout is no longer in loaded history', () => {
    expect(finishSummaryWorkoutGone(summary, [synced], [], '2026-11-01')).toBe(false);
    expect(finishSummaryWorkoutGone(summary, [], [], '2026-11-01')).toBe(true);
  });

  it('waits while the workout is still waiting to sync, or its day is not loaded', () => {
    const waiting = [{ id: null, client_session_id: 'session-1' }];
    expect(finishSummaryWorkoutGone(summary, [], waiting, '2026-11-01')).toBe(false);
    expect(finishSummaryWorkoutGone(summary, [], [], '2026-11-18')).toBe(false);
  });

  it('follows a resumed workout by its saved id', () => {
    const resumed = buildFinishSummary(
      { ...finished([]), client_session_id: undefined },
      exercises,
      [],
      1,
      'w7',
    );
    expect(resumed.workoutId).toBe('w7');
    expect(finishSummaryWorkoutGone(resumed, [{ id: 'w7' }], [], '2026-11-01')).toBe(false);
    expect(finishSummaryWorkoutGone(resumed, [synced], [], '2026-11-01')).toBe(true);
  });

  it('leaves alone an older summary that cannot name its workout', () => {
    const unnamed = { ...summary, sessionId: null, workoutId: undefined };
    expect(finishSummaryWorkoutGone(unnamed, [], [], '2026-11-01')).toBe(false);
  });
});

describe('finish summary storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps the summary per account for the rest of the day, then lets it go', () => {
    const summary = buildFinishSummary(finished([]), exercises, [], 5000);
    writeFinishSummary('user-1', summary);
    expect(readFinishSummary('user-1', 6000)).toEqual(summary);
    expect(readFinishSummary('user-2', 6000)).toBeNull();
    expect(readFinishSummary('user-1', 5000 + FINISH_SUMMARY_MAX_AGE_MS + 1)).toBeNull();
    writeFinishSummary('user-1', null);
    expect(readFinishSummary('user-1', 6000)).toBeNull();
  });

  it('ignores anything stored that is not a summary', () => {
    window.localStorage.setItem('relay:finished-workout:v1:user-1', '{"name":"x"}');
    expect(readFinishSummary('user-1', 1)).toBeNull();
    window.localStorage.setItem('relay:finished-workout:v1:user-1', 'not json');
    expect(readFinishSummary('user-1', 1)).toBeNull();
  });
});

describe('rep range on a planned exercise', () => {
  const routine = {
    id: 'routine',
    name: 'Upper / Lower',
    shared: false,
    days: [
      {
        workout_type_id: 'lower',
        workout_type: null,
        movements: [
          { exercise_id: 'extension', exercise: extension, sets: [] },
          {
            exercise_id: 'leg-press',
            exercise: legPress,
            sets: [],
            rep_range: { min: 6, max: 10 },
          },
        ],
      },
      {
        workout_type_id: 'lower',
        workout_type: null,
        movements: [{ exercise_id: 'extension', exercise: extension, sets: [] }],
      },
    ],
  } as unknown as Routine;

  it('applies only where the active split plans the exercise without a range', () => {
    expect(activeRoutineWithout(routine, 'extension')).toBe(true);
    expect(activeRoutineWithout(routine, 'leg-press')).toBe(false);
    expect(activeRoutineWithout(routine, 'bike')).toBe(false);
    expect(activeRoutineWithout(null, 'extension')).toBe(false);
  });

  it('sets the range on every day that plans the exercise and keeps existing ranges', () => {
    const next = withRepRange(routine, 'extension', { min: 12, max: 15 });
    expect(next.days.map((day) => day.movements.map((movement) => movement.rep_range))).toEqual([
      [
        { min: 12, max: 15 },
        { min: 6, max: 10 },
      ],
      [{ min: 12, max: 15 }],
    ]);
    expect(withRepRange(next, 'leg-press', { min: 3, max: 5 })).toEqual(next);
  });

  it('suggests the first preset with room above the reps the exercise is stuck at', () => {
    expect(suggestedRepRange(12, REP_RANGE_PRESETS)).toEqual({ min: 10, max: 15 });
    expect(suggestedRepRange(8, REP_RANGE_PRESETS)).toEqual({ min: 6, max: 10 });
    expect(suggestedRepRange(2, REP_RANGE_PRESETS)).toEqual({ min: 3, max: 5 });
    expect(suggestedRepRange(30, REP_RANGE_PRESETS)).toEqual({ min: 15, max: 20 });
  });
});
