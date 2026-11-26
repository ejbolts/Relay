import { describe, expect, it } from 'vitest';
import type { Exercise } from './types';
import { withElapsedSeconds } from './workoutPause';
import { correctedSessionSeconds } from './workoutTimeCorrection';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';
import {
  checkWorkoutFinish,
  finishedWorkoutInput,
  liveWorkoutIdentity,
  type WorkoutFinishState,
} from './workoutFinish';
import type { WorkoutDraftMovement, WorkoutDraftSet } from './workoutMovements';

const press: Exercise = {
  id: 'press',
  name: 'Overhead Press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Shoulders',
  equipment: 'barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const row: Exercise = {
  ...press,
  id: 'row',
  name: 'Rowing Machine',
  category: 'cardio',
  kind: 'cardio',
};

function set(values: Partial<WorkoutDraftSet>): WorkoutDraftSet {
  return {
    key: 'set',
    reps: null,
    weight_kg: null,
    rpe: null,
    rest_seconds: null,
    duration_seconds: null,
    distance_km: null,
    notes: null,
    set_type: 'normal',
    warmup: false,
    failed: false,
    completed: false,
    ...values,
  };
}

function movement(
  exercise: Exercise,
  sets: WorkoutDraftSet[],
  values: Partial<WorkoutDraftMovement> = {},
): WorkoutDraftMovement {
  return {
    key: exercise.id,
    exercise,
    notes: '',
    machinePhotoIds: [],
    machinePhotosInitialized: true,
    supersetKey: null,
    isComplete: false,
    sets,
    ...values,
  };
}

const startedAt = new Date(2026, 10, 22, 9, 0).getTime();
const push = DEFAULT_WORKOUT_TYPES.find((type) => type.id === 'push')!;

function state(values: Partial<WorkoutFinishState> = {}): WorkoutFinishState {
  return {
    movements: [movement(press, [set({ reps: 5, weight_kg: 50, completed: true })])],
    name: '',
    category: 'push',
    customTypeId: null,
    workoutTypeExplicit: false,
    selectedType: push,
    typeOptions: DEFAULT_WORKOUT_TYPES,
    types: DEFAULT_WORKOUT_TYPES,
    typesLoading: false,
    editing: false,
    resumedWorkoutId: null,
    startedAt,
    previousDurationMinutes: 0,
    durationOverrideMinutes: null,
    pause: { pausedMs: 0, pausedAt: null },
    editedDurationMinutes: 0,
    startTime: '',
    endTime: '',
    clientSessionId: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
    baseRevision: undefined,
    workoutDate: '2026-11-22',
    notes: '  ',
    ...values,
  };
}

describe('finishing a live workout', () => {
  it('builds the workout the server saves, with its session id and clock times', () => {
    const finishing = state({ pause: { pausedMs: 10 * 60_000, pausedAt: null } });
    const check = checkWorkoutFinish(finishing, undefined, startedAt + 55 * 60_000);
    expect(check).toMatchObject({ kind: 'ready', durationMinutes: 45 });
    if (check.kind !== 'ready') throw new Error('not ready');
    expect(finishedWorkoutInput(finishing, check)).toEqual({
      client_session_id: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
      name: 'Push workout',
      workout_date: '2026-11-22',
      category: 'push',
      workout_type_id: null,
      notes: null,
      duration_minutes: 45,
      // Paused time comes off the start: the workout ends when it was finished.
      start_time: '09:10',
      end_time: '09:55',
      movements: [
        {
          exercise_id: 'press',
          notes: null,
          machine_photo_ids: [],
          machine_settings: [],
          superset_key: null,
          sets: [
            {
              reps: 5,
              machine_photo_id: null,
              weight_kg: 50,
              rpe: null,
              rest_seconds: null,
              duration_seconds: null,
              distance_km: null,
              calories_kcal: undefined,
              average_heart_rate_bpm: undefined,
              incline_percent: null,
              speed_kph: null,
              bodyweight_kg: undefined,
              percentile: undefined,
              warmup: false,
              set_type: 'normal',
              failed: false,
              target_reps: undefined,
              notes: null,
              completed: true,
            },
          ],
        },
      ],
    });
  });

  it('needs a ticked set, and never saves a ticked set with nothing in it', () => {
    expect(checkWorkoutFinish(state({ movements: [] }))).toMatchObject({ kind: 'blocked' });
    const empty = state({ movements: [movement(press, [set({ completed: true })])] });
    expect(checkWorkoutFinish(empty)).toMatchObject({
      kind: 'blocked',
      message: expect.stringMatching(/^No sets have been marked complete/),
    });
  });

  it('waits for workout types and refuses a type that could not load', () => {
    expect(checkWorkoutFinish(state({ typesLoading: true }))).toMatchObject({ kind: 'blocked' });
    expect(checkWorkoutFinish(state({ customTypeId: 'mine' }))).toMatchObject({
      kind: 'blocked',
      message: expect.stringMatching(/could not load/),
    });
  });

  it('counts logged cardio towards the duration and names a mixed workout by its parts', () => {
    const mixed = state({
      movements: [
        movement(press, [set({ reps: 5, weight_kg: 50, completed: true })]),
        movement(row, [set({ duration_seconds: 40 * 60, completed: true })]),
      ],
    });
    const check = checkWorkoutFinish(mixed, undefined, startedAt + 20 * 60_000);
    expect(check).toMatchObject({ kind: 'ready', durationMinutes: 40 });
    expect(liveWorkoutIdentity(mixed).name).toBe('Push + Cardio workout');
  });

  it('keeps a name the person typed', () => {
    expect(liveWorkoutIdentity(state({ name: 'Morning lift' })).name).toBe('Morning lift');
  });

  it('names the exercise, set and allowed range when a set value is out of bounds', () => {
    const highHeartRate = state({
      movements: [
        movement(row, [
          set({ duration_seconds: 1800, average_heart_rate_bpm: 1132, completed: true }),
        ]),
      ],
    });
    expect(checkWorkoutFinish(highHeartRate)).toEqual({
      kind: 'blocked',
      message:
        'Rowing Machine, set 1: average heart rate (1132 bpm) must be a whole number between 20 and 250 bpm.',
    });

    const fastSpeed = state({
      movements: [
        movement(row, [set({ duration_seconds: 1800, speed_kph: 120, completed: true })]),
      ],
    });
    expect(checkWorkoutFinish(fastSpeed)).toEqual({
      kind: 'blocked',
      message: 'Rowing Machine, set 1: speed (120 km/h) must be between 0 and 100 km/h.',
    });

    const badRpe = state({
      movements: [
        movement(press, [
          set({ key: 's1', reps: 5, weight_kg: 50, completed: true }),
          set({ key: 's2', reps: 5, weight_kg: 50, rpe: 12, completed: false }),
        ]),
      ],
    });
    expect(checkWorkoutFinish(badRpe)).toEqual({
      kind: 'blocked',
      message: 'Overhead Press, set 2: RPE (12) must be between 1 and 10.',
    });
  });
});

describe('saved times after correcting the live clock', () => {
  const minutes = (count: number) => count * 60_000;
  /** Finishes `finishing` at `finishedAt` and returns the saved times. */
  function saved(finishing: WorkoutFinishState, finishedAt: number) {
    const check = checkWorkoutFinish(finishing, undefined, finishedAt);
    if (check.kind !== 'ready') throw new Error(`not ready: ${check.kind}`);
    const { start_time, end_time, duration_minutes } = finishedWorkoutInput(finishing, check);
    return { start_time, end_time, duration_minutes };
  }
  /** The clock corrected at `at` to read `totalMinutes` for the whole workout. */
  const corrected = (finishing: WorkoutFinishState, at: number, totalMinutes: number) => ({
    ...finishing,
    pause: withElapsedSeconds(
      finishing.pause,
      finishing.startedAt,
      correctedSessionSeconds(totalMinutes * 60, finishing.previousDurationMinutes),
      at,
    ),
  });

  it('ends when it was finished and moves the start back by the corrected time', () => {
    // Started at 09:00 but begun at 08:30: at 09:10 the clock is set to 40 minutes.
    const finishing = corrected(state(), startedAt + minutes(10), 40);
    // Finished at 09:40, with the clock reading 70 minutes. It used to save 09:00 to 10:10.
    expect(saved(finishing, startedAt + minutes(40))).toEqual({
      start_time: '08:30',
      end_time: '09:40',
      duration_minutes: 70,
    });
  });

  it('moves the start back across midnight', () => {
    const lateStart = new Date(2026, 10, 22, 23, 30).getTime();
    const finishing = corrected(state({ startedAt: lateStart }), lateStart + minutes(10), 45);
    // Finished at 00:05 with 70 minutes on the clock. It used to save 23:30 to 00:40.
    expect(saved(finishing, lateStart + minutes(35))).toEqual({
      start_time: '22:55',
      end_time: '00:05',
      duration_minutes: 70,
    });
  });

  it('counts the minutes already saved when a resumed workout is corrected', () => {
    // 40 minutes were saved; resumed at 09:00, and at 09:10 the whole workout is set to 60.
    const resumed = state({ resumedWorkoutId: 'saved', previousDurationMinutes: 40 });
    const finishing = corrected(resumed, startedAt + minutes(10), 60);
    // Finished at 09:20: 60 + 10 minutes. It used to save 40 + 60 + 10 = 110. A resumed
    // workout keeps sending no clock times, as before.
    expect(saved(finishing, startedAt + minutes(20))).toEqual({
      start_time: null,
      end_time: null,
      duration_minutes: 70,
    });
  });
});
