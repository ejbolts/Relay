import { describe, expect, it } from 'vitest';
import {
  ACTIVE_WORKOUT_DRAFT_KEY,
  clearActiveWorkoutDraft,
  readActiveWorkoutDraft,
  savedWorkoutMatchesOldDraft,
  writeActiveWorkoutDraft,
} from './workoutDraft';
import type { ActiveWorkoutDraft, DraftStorage } from './workoutDraft';
import type { TrackedSet, TrackedWorkout } from './types';

class MemoryStorage implements DraftStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const draft: ActiveWorkoutDraft = {
  version: 1,
  startedAt: Date.UTC(2026, 7, 1, 9),
  updatedAt: Date.UTC(2026, 7, 1, 9, 30),
  lastActiveAt: Date.UTC(2026, 7, 1, 9, 25),
  name: 'Push workout',
  workoutDate: '2026-08-01',
  category: 'push',
  notes: 'Strong session',
  movements: [
    {
      key: 'movement-1',
      exerciseId: 'bench',
      notes: 'Pause reps',
      machinePhotoIds: ['photo-1'],
      supersetKey: null,
      isComplete: true,
      sets: [
        {
          key: 'set-1',
          reps: 5,
          weight_kg: 100,
          rpe: 8,
          rest_seconds: 180,
          duration_seconds: null,
          distance_km: null,
          incline_percent: null,
          speed_kph: null,
          notes: null,
          completed: true,
        },
      ],
    },
  ],
};

describe('active workout draft persistence', () => {
  it('round-trips an immutable completion and rejects a missing target or mismatched session', () => {
    const storage = new MemoryStorage();
    const sessionId = 'c911075b-8eb3-48b0-8790-f535d579fa52';
    const completed: ActiveWorkoutDraft = {
      ...draft,
      clientSessionId: sessionId,
      pendingSave: {
        userId: 'sample-owner',
        finishedAt: draft.updatedAt,
        workoutId: null,
        payload: {
          client_session_id: sessionId,
          name: draft.name,
          workout_date: draft.workoutDate,
          category: draft.category,
          notes: draft.notes,
          duration_minutes: 30,
          start_time: null,
          end_time: null,
          movements: draft.movements.map((movement) => ({
            exercise_id: movement.exerciseId,
            notes: movement.notes,
            machine_photo_ids: movement.machinePhotoIds,
            sets: movement.sets,
          })),
        },
      },
    };
    expect(writeActiveWorkoutDraft(completed, storage)).toBe(true);
    expect(readActiveWorkoutDraft(storage)).toEqual(completed);
    for (const invalid of [
      { ...completed.pendingSave, workoutId: undefined },
      {
        ...completed.pendingSave,
        payload: { ...completed.pendingSave!.payload, client_session_id: 'different' },
      },
      {
        ...completed.pendingSave,
        payload: { ...completed.pendingSave!.payload, duration_minutes: null },
      },
    ]) {
      const raw = JSON.stringify({ ...completed, pendingSave: invalid });
      storage.setItem(ACTIVE_WORKOUT_DRAFT_KEY, raw);
      expect(readActiveWorkoutDraft(storage)).toBeNull();
      expect(storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).toBe(raw);
    }
  });

  it('preserves custom machine settings and rejects malformed settings', () => {
    const storage = new MemoryStorage();
    const withSettings = structuredClone(draft);
    withSettings.movements[0].machineSettings = [{ name: 'Pad', value: 'B' }];
    writeActiveWorkoutDraft(withSettings, storage);
    expect(readActiveWorkoutDraft(storage)?.movements[0].machineSettings).toEqual([
      { name: 'Pad', value: 'B' },
    ]);
    const malformed = JSON.parse(storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)!);
    malformed.movements[0].machineSettings = [{ name: 'Pad', value: 5 }];
    storage.setItem(ACTIVE_WORKOUT_DRAFT_KEY, JSON.stringify(malformed));
    expect(readActiveWorkoutDraft(storage)).toBeNull();
  });
  it('restores the explicit custom type and rejects a malformed type identifier', () => {
    const storage = new MemoryStorage();
    const custom = {
      ...draft,
      category: 'other' as const,
      workoutTypeId: 'type-arms',
      workoutTypeExplicit: true,
    };
    expect(writeActiveWorkoutDraft(custom, storage)).toBe(true);
    expect(readActiveWorkoutDraft(storage)).toEqual(custom);
    storage.setItem(ACTIVE_WORKOUT_DRAFT_KEY, JSON.stringify({ ...custom, workoutTypeId: {} }));
    expect(readActiveWorkoutDraft(storage)).toBeNull();
  });
  it('recognizes an old draft after its matching completed sets are saved', () => {
    const stored = {
      ...draft,
      startedAt: Date.UTC(2026, 7, 23),
      workoutDate: '2026-08-23',
      movements: [
        {
          ...draft.movements[0],
          sets: [
            { ...draft.movements[0].sets[0], reps: 10, weight_kg: 69, warmup: true },
            {
              ...draft.movements[0].sets[0],
              key: 'set-2',
              reps: 5,
              weight_kg: 86,
              completed: false,
            },
            { ...draft.movements[0].sets[0], key: 'set-3', reps: 9, weight_kg: 96 },
          ],
        },
      ],
    };
    const trackedSet = (
      item: (typeof stored.movements)[0]['sets'][number],
      id: string,
      order_index: number,
    ): TrackedSet => ({
      ...item,
      id,
      order_index,
      incline_percent: item.incline_percent ?? null,
      speed_kph: item.speed_kph ?? null,
      bodyweight_kg: item.bodyweight_kg ?? null,
      percentile: item.percentile ?? null,
      warmup: item.warmup ?? false,
      set_type: item.set_type ?? 'normal',
      failed: item.failed ?? false,
      target_reps: item.target_reps ?? null,
    });
    const saved: TrackedWorkout = {
      id: 'saved',
      name: 'Push workout',
      workout_date: '2026-08-23',
      category: 'push',
      notes: null,
      duration_minutes: 72,
      start_time: null,
      end_time: null,
      is_sample: false,
      created_at: '',
      updated_at: '',
      movements: [
        {
          id: 'movement',
          order_index: 0,
          notes: null,
          exercise: {
            id: 'bench',
            name: 'Bench',
            category: 'push',
            kind: 'strength',
            muscle_group: 'Chest',
            equipment: null,
            is_custom: true,
            is_favorite: false,
            muscle_contributions: [],
          },
          machine_photos: [],
          superset_group_id: null,
          superset_name: null,
          sets: [
            trackedSet(stored.movements[0].sets[0], 'one', 0),
            trackedSet(stored.movements[0].sets[1], 'two', 1),
            trackedSet(stored.movements[0].sets[2], 'three', 2),
          ],
        },
      ],
    };
    expect(savedWorkoutMatchesOldDraft(stored, saved, Date.UTC(2026, 8, 12))).toBe(true);
    const clientSessionId = '925d14de-9bfe-4d59-a081-4eaab99b714a';
    const identifiedDraft = { ...stored, clientSessionId, name: '' };
    const identifiedSaved = { ...saved, client_session_id: clientSessionId };
    // Exact save identity reconciles a lost response immediately, including auto-named sessions.
    expect(
      savedWorkoutMatchesOldDraft(identifiedDraft, identifiedSaved, stored.startedAt + 60_000),
    ).toBe(true);
    expect(
      savedWorkoutMatchesOldDraft(
        { ...identifiedDraft, resumingWorkoutId: saved.id },
        identifiedSaved,
        stored.startedAt + 60_000,
      ),
    ).toBe(false);
    expect(savedWorkoutMatchesOldDraft(identifiedDraft, saved, stored.startedAt + 60_000)).toBe(
      false,
    );
    expect(
      savedWorkoutMatchesOldDraft(
        { ...stored, workoutTypeId: 'arms' },
        saved,
        Date.UTC(2026, 8, 12),
      ),
    ).toBe(false);
    expect(
      savedWorkoutMatchesOldDraft(
        { ...stored, workoutTypeId: 'arms' },
        { ...saved, workout_type_id: 'arms' },
        Date.UTC(2026, 8, 12),
      ),
    ).toBe(true);
    expect(
      savedWorkoutMatchesOldDraft(
        { ...stored, resumingWorkoutId: saved.id, previousDurationMinutes: 72 },
        saved,
        Date.UTC(2026, 8, 12),
      ),
    ).toBe(false);
    expect(savedWorkoutMatchesOldDraft(stored, saved, Date.UTC(2026, 7, 23, 1))).toBe(false);
    saved.movements[0].sets[2].reps = 8;
    expect(savedWorkoutMatchesOldDraft(stored, saved, Date.UTC(2026, 8, 12))).toBe(false);
  });
  it('preserves a corrected duration when an old active workout is reopened', () => {
    const storage = new MemoryStorage();
    writeActiveWorkoutDraft({ ...draft, durationOverrideMinutes: 72 }, storage);
    expect(readActiveWorkoutDraft(storage)?.durationOverrideMinutes).toBe(72);
    expect(readActiveWorkoutDraft(storage)?.movements).toEqual(draft.movements);
    writeActiveWorkoutDraft({ ...draft, durationOverrideMinutes: 28_740 }, storage);
    expect(readActiveWorkoutDraft(storage)).toBeNull();
  });
  it('round-trips and clears a workout draft', () => {
    const storage = new MemoryStorage();

    expect(writeActiveWorkoutDraft(draft, storage)).toBe(true);
    expect(readActiveWorkoutDraft(storage)).toEqual(draft);

    clearActiveWorkoutDraft(storage);
    expect(readActiveWorkoutDraft(storage)).toBeNull();
  });

  it('keeps the saved workout identity and previous duration when a resumed session reloads', () => {
    const storage = new MemoryStorage();
    writeActiveWorkoutDraft(
      { ...draft, resumingWorkoutId: 'saved-workout', previousDurationMinutes: 45 },
      storage,
    );
    expect(readActiveWorkoutDraft(storage)).toMatchObject({
      resumingWorkoutId: 'saved-workout',
      previousDurationMinutes: 45,
      startedAt: draft.startedAt,
    });
  });

  it('persists the inactivity deadline and rejects one before the workout began', () => {
    const storage = new MemoryStorage();
    const inactiveFinishAt = draft.startedAt + 3 * 60 * 60 * 1000;

    writeActiveWorkoutDraft({ ...draft, inactiveFinishAt }, storage);
    expect(readActiveWorkoutDraft(storage)?.inactiveFinishAt).toBe(inactiveFinishAt);

    writeActiveWorkoutDraft({ ...draft, inactiveFinishAt: draft.startedAt - 1 }, storage);
    expect(readActiveWorkoutDraft(storage)).toBeNull();
  });

  it('keeps older drafts compatible and rejects activity before the workout began', () => {
    const storage = new MemoryStorage();
    const olderDraft = { ...draft };
    delete olderDraft.lastActiveAt;

    writeActiveWorkoutDraft(olderDraft, storage);
    expect(readActiveWorkoutDraft(storage)).toEqual(olderDraft);

    storage.setItem(
      ACTIVE_WORKOUT_DRAFT_KEY,
      JSON.stringify({ ...draft, lastActiveAt: draft.startedAt - 1 }),
    );
    expect(readActiveWorkoutDraft(storage)).toBeNull();
  });

  it('ignores corrupt or incompatible stored data', () => {
    const storage = new MemoryStorage();
    storage.setItem(ACTIVE_WORKOUT_DRAFT_KEY, '{not-json');
    expect(readActiveWorkoutDraft(storage)).toBeNull();

    storage.setItem(ACTIVE_WORKOUT_DRAFT_KEY, JSON.stringify({ ...draft, version: 2 }));
    expect(readActiveWorkoutDraft(storage)).toBeNull();
  });
});
