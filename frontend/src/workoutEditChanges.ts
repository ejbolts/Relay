import { useState } from 'react';
import type { WorkoutSetInput } from './types';
import type { WorkoutDraftMovement } from './workoutMovements';

/** What Save writes back when a saved workout is edited. */
export interface WorkoutEditFields {
  name: string;
  workoutDate: string;
  category: string;
  customTypeId: string | null;
  notes: string;
  durationMinutes: number;
  startTime: string;
  endTime: string;
  movements: WorkoutDraftMovement[];
}

const SAVED_SET_FIELDS = [
  'reps',
  'partial_reps',
  'assisted_reps',
  'weight_kg',
  'rpe',
  'rest_seconds',
  'duration_seconds',
  'distance_km',
  'calories_kcal',
  'average_heart_rate_bpm',
  'incline_percent',
  'speed_kph',
  'bodyweight_kg',
  'percentile',
  'warmup',
  'set_type',
  'failed',
  'target_reps',
  'notes',
  'completed',
  'machine_photo_id',
] as const satisfies readonly (keyof WorkoutSetInput)[];

/**
 * A comparable copy of the saved fields. Row keys, expanded cards and other on-screen state are
 * left out, so only a change that Save would write counts.
 */
export function workoutEditSnapshot(fields: WorkoutEditFields): string {
  return JSON.stringify({
    name: fields.name.trim(),
    workoutDate: fields.workoutDate,
    category: fields.category,
    customTypeId: fields.customTypeId,
    notes: fields.notes.trim(),
    durationMinutes: fields.durationMinutes,
    startTime: fields.startTime,
    endTime: fields.endTime,
    movements: fields.movements.map((movement) => ({
      exercise: movement.exercise.id,
      notes: movement.notes.trim(),
      machinePhotoIds: movement.machinePhotoIds,
      machineSettings: movement.machineSettings ?? [],
      superset: movement.supersetKey,
      sets: movement.sets.map((item) => SAVED_SET_FIELDS.map((field) => item[field] ?? null)),
    })),
  });
}

/** Whether an editor of a saved workout differs from the workout it opened with. */
export function useUnsavedWorkoutChanges(enabled: boolean, fields: WorkoutEditFields): boolean {
  const snapshot = enabled ? workoutEditSnapshot(fields) : '';
  const [opened] = useState(snapshot);
  return enabled && snapshot !== opened;
}
