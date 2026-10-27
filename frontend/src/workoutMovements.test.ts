import { describe, expect, it } from 'vitest';
import type { Exercise } from './types';
import { replaceMovementExercise, type WorkoutDraftMovement } from './workoutMovements';

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
    expect(switched.sets).toBe(sets);
    expect(switched.notes).toBe('Seat position 4');
    expect(switched.supersetKey).toBe('superset-1');
    expect(switched.machinePhotoIds).toEqual([]);
    expect(switched.machinePhotosInitialized).toBe(false);
    expect(switched.machineSettings).toBeUndefined();
    expect(switched.isComplete).toBe(false);
  });
});
