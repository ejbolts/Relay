import { describe, expect, it } from 'vitest';
import {
  addFinishedWorkout,
  clearFinishedWorkouts,
  FINISHED_WORKOUTS_KEY,
  finishedWorkoutKey,
  keepFinishedWorkoutsFor,
  moveLegacyFinishedWorkout,
  readFinishedWorkouts,
  removeFinishedWorkout,
  type FinishedWorkout,
} from './finishedWorkoutQueue';
import {
  ACTIVE_WORKOUT_DRAFT_KEY,
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
    if (this.full) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const sessions = [
  '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
  '6f1c1e3a-7f2b-4c8d-9a3e-2b5d7c9e1f40',
  '9d2a4b6c-8e0f-4a1b-b3c5-d7e9f1a3b5c7',
];

function finished(index: number, overrides: Partial<FinishedWorkout['pendingSave']> = {}) {
  const startedAt = Date.UTC(2026, 9, 10 + index, 8);
  const workoutDate = `2026-10-${10 + index}`;
  const draft: ActiveWorkoutDraft = {
    version: 1,
    clientSessionId: sessions[index],
    startedAt,
    updatedAt: startedAt,
    name: `Workout ${index}`,
    workoutDate,
    category: 'push',
    notes: '',
    movements: [],
  };
  return {
    ...draft,
    pendingSave: {
      userId: 'sample-account',
      finishedAt: startedAt + 45 * 60_000,
      workoutId: null,
      payload: {
        client_session_id: sessions[index],
        name: `Workout ${index}`,
        workout_date: workoutDate,
        category: 'push',
        notes: null,
        duration_minutes: 45,
        start_time: null,
        end_time: null,
        movements: [
          {
            exercise_id: 'bench',
            notes: null,
            machine_photo_ids: [],
            sets: [{ reps: 8, weight_kg: 60, completed: true } as never],
          },
        ],
      },
      ...overrides,
    },
  } satisfies FinishedWorkout;
}

const names = (storage: DraftStorage) => readFinishedWorkouts(storage).map((item) => item.name);

describe('finished workouts waiting to sync', () => {
  it('keeps several finished workouts in finish order, one per session', () => {
    const storage = new MemoryStorage();
    expect(addFinishedWorkout(finished(2), storage)).toBe(true);
    expect(addFinishedWorkout(finished(0), storage)).toBe(true);
    expect(addFinishedWorkout(finished(1), storage)).toBe(true);
    expect(addFinishedWorkout({ ...finished(1), name: 'Workout 1 again' }, storage)).toBe(true);

    expect(names(storage)).toEqual(['Workout 0', 'Workout 1 again', 'Workout 2']);
    removeFinishedWorkout(finishedWorkoutKey(finished(0)), storage);
    expect(names(storage)).toEqual(['Workout 1 again', 'Workout 2']);
    clearFinishedWorkouts(storage);
    expect(storage.getItem(FINISHED_WORKOUTS_KEY)).toBeNull();
  });

  it('identifies a resumed workout by its id and finish time', () => {
    const resumed = finished(0, { workoutId: 'saved-workout' });
    const draft = { ...resumed, resumingWorkoutId: 'saved-workout' };
    expect(finishedWorkoutKey(draft)).toBe(sessions[0]);
    expect(
      finishedWorkoutKey({
        pendingSave: {
          ...draft.pendingSave,
          payload: { ...draft.pendingSave.payload, client_session_id: undefined },
        },
      }),
    ).toBe(`saved-workout@${draft.pendingSave.finishedAt}`);
  });

  it('skips a damaged entry without hiding the others', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      FINISHED_WORKOUTS_KEY,
      JSON.stringify({ version: 1, items: [finished(0), { name: 'damaged' }, finished(1)] }),
    );
    expect(names(storage)).toEqual(['Workout 0', 'Workout 1']);
    storage.setItem(FINISHED_WORKOUTS_KEY, 'not json');
    expect(readFinishedWorkouts(storage)).toEqual([]);
  });

  it('reports a full device instead of losing a finished workout', () => {
    const storage = new MemoryStorage();
    addFinishedWorkout(finished(0), storage);
    storage.full = true;
    expect(addFinishedWorkout(finished(1), storage)).toBe(false);
    expect(names(storage)).toEqual(['Workout 0']);
  });

  it('moves a finished workout an older release left in the draft, freeing the draft', () => {
    const storage = new MemoryStorage();
    addFinishedWorkout(finished(0), storage);
    writeActiveWorkoutDraft(finished(1), storage);
    // Still listed while it waits to move.
    expect(names(storage)).toEqual(['Workout 0', 'Workout 1']);

    moveLegacyFinishedWorkout(storage);
    expect(readActiveWorkoutDraft(storage)).toBeNull();
    expect(names(storage)).toEqual(['Workout 0', 'Workout 1']);
    expect(JSON.parse(storage.getItem(FINISHED_WORKOUTS_KEY)!).items).toHaveLength(2);
  });

  it('leaves an older finished workout in the draft when the queue cannot be written', () => {
    const storage = new MemoryStorage();
    writeActiveWorkoutDraft(finished(0), storage);
    storage.full = true;
    moveLegacyFinishedWorkout(storage);
    expect(readActiveWorkoutDraft(storage)?.pendingSave).toBeDefined();
    expect(names(storage)).toEqual(['Workout 0']);

    // Sending it removes it from wherever it is held.
    removeFinishedWorkout(finishedWorkoutKey(finished(0)), storage);
    expect(readActiveWorkoutDraft(storage)).toBeNull();
    expect(readFinishedWorkouts(storage)).toEqual([]);
  });

  it('never clears an unfinished workout in the draft', () => {
    const storage = new MemoryStorage();
    const unfinished: ActiveWorkoutDraft = { ...finished(1), pendingSave: undefined };
    writeActiveWorkoutDraft(unfinished, storage);
    moveLegacyFinishedWorkout(storage);
    removeFinishedWorkout(finishedWorkoutKey(finished(1)), storage);
    expect(readActiveWorkoutDraft(storage)?.name).toBe('Workout 1');
    expect(storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).not.toBeNull();
  });

  it('keeps only the signed-in account’s finished workouts', () => {
    const storage = new MemoryStorage();
    addFinishedWorkout(finished(0), storage);
    addFinishedWorkout(finished(1, { userId: 'other-account' }), storage);
    writeActiveWorkoutDraft(finished(2, { userId: 'other-account' }), storage);

    keepFinishedWorkoutsFor('sample-account', storage);
    expect(names(storage)).toEqual(['Workout 0']);
    expect(readActiveWorkoutDraft(storage)).toBeNull();
  });
});
