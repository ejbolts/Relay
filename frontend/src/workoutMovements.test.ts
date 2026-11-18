import { describe, expect, it } from 'vitest';
import type { Exercise } from './types';
import {
  replaceMovementExercise,
  restoreWorkoutDraftMovements,
  type WorkoutDraftMovement,
} from './workoutMovements';

const exercise = (id: string, name: string): Exercise => ({
  id,
  name,
  category: 'lower',
  kind: 'strength',
  muscle_group: 'Hamstrings',
  equipment: 'Machine',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
});

describe('switching an exercise', () => {
  it('restores merged exercise IDs without dropping workout data', () => {
    const target = { ...exercise('target', 'Leg Curl'), merged_from_ids: ['old', 'older'] };
    const stored = ['old', 'older'].map((exerciseId) => ({
      exerciseId,
      key: exerciseId,
      notes: 'Keep this',
      machinePhotoIds: ['photo'],
      machineSettings: [{ name: 'Seat', value: '3' }],
      supersetKey: 'group',
      isComplete: true,
      sets: [],
    }));
    const restored = restoreWorkoutDraftMovements(stored, [target])!;
    expect(restored.map((item) => item.exercise.id)).toEqual(['target', 'target']);
    expect(restored[0].machinePhotoIds).toEqual(['photo']);
    expect(restored[0].machineSettings).toEqual(stored[0].machineSettings);
    expect(restored[0].notes).toBe('Keep this');
    expect(restored[0].supersetKey).toBe('group');
    expect(
      restoreWorkoutDraftMovements([{ ...stored[0], exerciseId: 'missing' }], [target]),
    ).toBeNull();
  });
  it('keeps entered sets, notes, and supersets while resetting incompatible photos', () => {
    const sets = [
      {
        key: 'set-1',
        reps: 10,
        weight_kg: 45,
        rpe: 8,
        rest_seconds: 90,
        duration_seconds: null,
        distance_km: null,
        incline_percent: null,
        speed_kph: null,
        notes: 'Controlled eccentric',
        set_type: 'normal' as const,
        failed: false,
        warmup: false,
        completed: true,
        machine_photo_id: 'seated-photo',
      },
    ];
    const movement: WorkoutDraftMovement = {
      key: 'movement-1',
      exercise: exercise('seated', 'Seated Leg Curl'),
      notes: 'Seat position 4',
      machinePhotoIds: ['seated-photo'],
      machinePhotosInitialized: true,
      machineSettings: [{ name: 'Seat', value: '5' }],
      supersetKey: 'superset-1',
      isComplete: true,
      sets,
    };

    const [switched] = replaceMovementExercise(
      [movement],
      movement.key,
      exercise('lying', 'Lying Leg Curl'),
    );

    expect(switched.exercise.name).toBe('Lying Leg Curl');
    expect(switched.sets).toEqual([{ ...sets[0], machine_photo_id: null }]);
    expect(switched.notes).toBe('Seat position 4');
    expect(switched.supersetKey).toBe('superset-1');
    expect(switched.machinePhotoIds).toEqual([]);
    expect(switched.machinePhotosInitialized).toBe(false);
    expect(switched.machineSettings).toBeUndefined();
    expect(switched.isComplete).toBe(false);
  });
});
