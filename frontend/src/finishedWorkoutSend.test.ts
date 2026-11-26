import { describe, expect, it } from 'vitest';
import { readFinishedWorkouts } from './finishedWorkoutQueue';
import { inactiveWorkoutFinishAt } from './activeWorkoutTimeout';
import type { FinishedWorkout } from './finishedWorkoutQueue';
import {
  finishedSaveFailure,
  finishedSaveRetryDelayMs,
  moveDraftToFinishedQueue,
  rebasedFinishedWorkout,
  reviewedFinishedWorkout,
} from './finishedWorkoutSend';
import type { WorkoutInput } from './types';
import {
  readActiveWorkoutDraft,
  writeActiveWorkoutDraft,
  type ActiveWorkoutDraft,
  type DraftStorage,
} from './workoutDraft';

class MemoryStorage implements DraftStorage {
  values = new Map<string, string>();
  full = false;
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.full) throw new Error('Quota exceeded');
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const session = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
const startedAt = Date.UTC(2026, 10, 22, 8);
const draft: ActiveWorkoutDraft = {
  version: 1,
  clientSessionId: session,
  startedAt,
  updatedAt: startedAt,
  name: '',
  workoutDate: '2026-11-22',
  category: 'push',
  notes: '',
  movements: [],
};
const payload: WorkoutInput = {
  client_session_id: session,
  name: 'Push workout',
  workout_date: '2026-11-22',
  category: 'push',
  workout_type_id: null,
  notes: null,
  duration_minutes: 30,
  start_time: '08:00',
  end_time: '08:30',
  movements: [
    {
      exercise_id: 'press',
      notes: null,
      machine_photo_ids: [],
      sets: [
        {
          reps: 5,
          weight_kg: 50,
          rpe: null,
          rest_seconds: null,
          duration_seconds: null,
          distance_km: null,
          notes: null,
          completed: true,
        },
      ],
    },
  ],
};

describe('queueing a finished workout', () => {
  it('moves the active draft into the queue before any request', () => {
    const storage = new MemoryStorage();
    writeActiveWorkoutDraft(draft, storage);
    const completion = moveDraftToFinishedQueue(payload, 'user-1', startedAt + 1, storage);
    expect(completion).toEqual({
      userId: 'user-1',
      finishedAt: startedAt + 1,
      workoutId: null,
      payload,
    });
    expect(readActiveWorkoutDraft(storage)).toBeNull();
    expect(readFinishedWorkouts(storage)).toEqual([{ ...draft, pendingSave: completion }]);
  });

  it('keeps the workout open when it belongs to another session or storage is full', () => {
    const storage = new MemoryStorage();
    writeActiveWorkoutDraft(draft, storage);
    expect(() =>
      moveDraftToFinishedQueue(
        { ...payload, client_session_id: '6f1c1e3a-7f2b-4c8d-9a3e-2b5d7c9e1f40' },
        'user-1',
        startedAt + 1,
        storage,
      ),
    ).toThrow(/could not be stored/);
    storage.full = true;
    expect(() => moveDraftToFinishedQueue(payload, 'user-1', startedAt + 1, storage)).toThrow(
      /free some storage/,
    );
    expect(readActiveWorkoutDraft(storage)).toEqual(draft);
    expect(readFinishedWorkouts(storage)).toEqual([]);
  });

  it('retries connection and server failures, and holds refusals for review', () => {
    expect(finishedSaveFailure(undefined, false)).toBe('retry');
    expect(finishedSaveFailure(503, false)).toBe('retry');
    expect(finishedSaveFailure(408, false)).toBe('retry');
    expect(finishedSaveFailure(429, false)).toBe('retry');
    expect(finishedSaveFailure(422, false)).toBe('refused');
    expect(finishedSaveFailure(426, true)).toBe('outdated');
    expect([0, 1, 2, 3, 4].map(finishedSaveRetryDelayMs)).toEqual([
      5000, 10_000, 20_000, 40_000, 60_000,
    ]);
  });
});

describe('reviewing a refused save', () => {
  const finished = {
    version: 1,
    clientSessionId: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
    startedAt: 1_000,
    updatedAt: 2_000,
    lastActiveAt: 2_000,
    inactiveFinishAt: 3_000,
    name: 'Push',
    workoutDate: '2026-11-23',
    category: 'push',
    notes: '',
    movements: [],
    resumingWorkoutId: 'w1',
    resumingWorkoutRevision: 2,
    pendingSave: {
      userId: 'u1',
      finishedAt: 2_500,
      workoutId: 'w1',
      payload: { name: 'Push', duration_minutes: 42, base_revision: 2 } as WorkoutInput,
    },
  } as FinishedWorkout;

  it('reopens the draft with the duration it finished with and a fresh cutoff', () => {
    const now = 10_000_000;
    const draft = reviewedFinishedWorkout(finished, now);
    expect(draft).not.toHaveProperty('pendingSave');
    expect(draft).toMatchObject({
      clientSessionId: finished.clientSessionId,
      durationOverrideMinutes: 42,
      lastActiveAt: now,
      inactiveFinishAt: inactiveWorkoutFinishAt(1_000, now),
    });
  });

  it('keeping this version rebases the waiting save on the revision now saved', () => {
    const rebased = rebasedFinishedWorkout(finished, 5);
    expect(rebased.resumingWorkoutRevision).toBe(5);
    expect(rebased.pendingSave.payload.base_revision).toBe(5);
    expect(finished.pendingSave.payload.base_revision).toBe(2);
  });
});
