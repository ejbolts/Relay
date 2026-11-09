import { createSuggestedWorkoutSet } from './workoutSets';
import type {
  ExerciseHistoryBaseline,
  ExerciseKind,
  MachinePhoto,
  TrackedSet,
  TrackedWorkout,
} from './types';
import type { WorkoutDraftSet } from './workoutMovements';

export type ExerciseHistoryEntry = {
  workoutId: string;
  workoutDate: string;
  workoutName: string;
  movementNotes: string | null;
  sets: TrackedSet[];
  /** Machine photos pinned to the session; unknown for older history. */
  machinePhotoIds?: string[];
};

export function recentExerciseHistory(
  workouts: TrackedWorkout[],
  exerciseId: string,
  excludedWorkoutId?: string,
  limit = 5,
  /** The exercise's latest session before the loaded workouts, if any. */
  older: ExerciseHistoryBaseline['latest'] = null,
): ExerciseHistoryEntry[] {
  const newestFirst = [...workouts].sort(
    (left, right) =>
      right.workout_date.localeCompare(left.workout_date) ||
      right.created_at.localeCompare(left.created_at),
  );
  const entries: ExerciseHistoryEntry[] = [];

  for (const workout of newestFirst) {
    if (workout.id === excludedWorkoutId) continue;
    for (const movement of workout.movements) {
      if (movement.exercise.id !== exerciseId) continue;
      const completedSets = movement.sets
        .filter((item) => item.completed)
        .sort((left, right) => left.order_index - right.order_index);
      if (!completedSets.length && !movement.notes) continue;
      entries.push({
        workoutId: workout.id,
        workoutDate: workout.workout_date,
        workoutName: workout.name,
        movementNotes: movement.notes,
        sets: completedSets,
        machinePhotoIds: movement.machine_photos.map((photo) => photo.id),
      });
      if (entries.length === limit) return entries;
    }
  }

  if (
    older &&
    older.workout_id !== excludedWorkoutId &&
    !entries.some((entry) => entry.workoutId === older.workout_id)
  ) {
    entries.push({
      workoutId: older.workout_id,
      workoutDate: older.workout_date,
      workoutName: older.workout_name,
      movementNotes: older.movement_notes,
      sets: older.sets,
    });
  }
  return entries;
}

/** Each merged-away photo id mapped to the saved machine it now belongs to. */
export function machineAliases(photos: MachinePhoto[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const photo of photos) {
    for (const image of photo.images ?? []) aliases.set(image.id, photo.id);
  }
  return aliases;
}

/** The one saved machine a session pinned, or null when it pinned none or several. */
export function entryMachineId(
  entry: ExerciseHistoryEntry,
  aliases: ReadonlyMap<string, string>,
): string | null {
  const machines = new Set((entry.machinePhotoIds ?? []).map((id) => aliases.get(id) ?? id));
  return machines.size === 1 ? [...machines][0] : null;
}

/** Sessions on this machine, newest first; every session when no machine is chosen. */
export function historyOnMachine(
  history: ExerciseHistoryEntry[],
  machineId: string | null | undefined,
  aliases: ReadonlyMap<string, string>,
): ExerciseHistoryEntry[] {
  if (!machineId) return history;
  const machine = aliases.get(machineId) ?? machineId;
  return history.filter((entry) => entryMachineId(entry, aliases) === machine);
}

/**
 * The sets to suggest for a machine: its latest session, or the exercise's latest session when
 * the machine has none yet.
 */
export function machineSuggestionSource(
  history: ExerciseHistoryEntry[],
  machineId: string | null | undefined,
  aliases: ReadonlyMap<string, string>,
): TrackedSet[] {
  const withSets = (entries: ExerciseHistoryEntry[]) =>
    entries.find((entry) => entry.sets.length)?.sets;
  return withSets(historyOnMachine(history, machineId, aliases)) ?? withSets(history) ?? [];
}

/**
 * Swap untouched suggestions for another session's sets, row by row. Logged and edited sets stay
 * where they are; untouched rows the new session has no counterpart for are dropped.
 */
export function withSuggestedSets(
  current: WorkoutDraftSet[],
  previous: TrackedSet[],
  kind: ExerciseKind,
): WorkoutDraftSet[] {
  if (!previous.length) return current;
  const length = Math.max(current.length, previous.length);
  const sets: WorkoutDraftSet[] = [];
  for (let index = 0; index < length; index += 1) {
    const item = current[index];
    if (item && (item.completed || !item.fromPrevious)) {
      sets.push(item);
    } else if (previous[index]) {
      sets.push({
        key: item?.key ?? crypto.randomUUID(),
        ...createSuggestedWorkoutSet(kind, previous[index]),
        fromPrevious: true,
        restRevealed: false,
      });
    }
  }
  return sets;
}
