import { extraRepsText } from './extraReps';
import type { StoredDraftSet, ActiveWorkoutDraft } from './workoutDraft';
import { formatWeight, type WeightUnit } from './weightUnits';

export interface WorkoutSyncDifference {
  key: string;
  label: string;
  local: string;
  remote: string;
}

/** A set as both devices would show it: weight × reps (or cardio), ticked or not. */
export function syncSetText(set: StoredDraftSet | undefined, unit: WeightUnit): string {
  if (!set) return 'No set';
  const strength = [
    set.weight_kg != null ? formatWeight(set.weight_kg, unit) : null,
    set.reps != null ? `${set.reps} ${set.reps === 1 ? 'rep' : 'reps'}` : null,
  ].filter(Boolean);
  const cardio = [
    set.duration_seconds != null ? `${Math.round(set.duration_seconds / 60)} min` : null,
    set.distance_km != null ? `${set.distance_km} km` : null,
  ].filter(Boolean);
  const extras = extraRepsText(set);
  const result = (strength.length ? strength.join(' × ') : cardio.join(' · ')) || '–';
  const text = extras ? `${result} ${extras}` : result;
  return set.completed ? `${text} ✓` : text;
}

/**
 * Only what differs between this device's workout and the other device's, such as
 * "Barbell Row · set 1: 70 kg × 8 / 95 kg × 8", so choosing a version needs no comparing by eye.
 */
export function workoutSyncDifferences(
  local: ActiveWorkoutDraft | null,
  remote: ActiveWorkoutDraft | null,
  exerciseName: (exerciseId: string) => string,
  unit: WeightUnit,
): WorkoutSyncDifference[] {
  if (!local || !remote)
    return [
      {
        key: 'workout',
        label: 'Workout',
        local: local ? 'In progress' : 'Ended',
        remote: remote ? 'In progress' : 'Ended',
      },
    ];
  const differences: WorkoutSyncDifference[] = [];
  const add = (key: string, label: string, mine: string, theirs: string) => {
    if (mine !== theirs) differences.push({ key, label, local: mine, remote: theirs });
  };
  add('name', 'Name', local.name.trim() || '–', remote.name.trim() || '–');
  const keys = [
    ...new Set([...local.movements, ...remote.movements].map((movement) => movement.key)),
  ];
  for (const key of keys) {
    const mine = local.movements.find((movement) => movement.key === key);
    const theirs = remote.movements.find((movement) => movement.key === key);
    const name = exerciseName((mine ?? theirs)!.exerciseId);
    if (!mine || !theirs) {
      const sets = (mine ?? theirs)!.sets.length;
      const added = `Added · ${sets} ${sets === 1 ? 'set' : 'sets'}`;
      add(key, name, mine ? added : 'Not added', theirs ? added : 'Not added');
      continue;
    }
    const count = Math.max(mine.sets.length, theirs.sets.length);
    for (let index = 0; index < count; index += 1) {
      const [left, right] = [mine.sets[index], theirs.sets[index]];
      add(
        `${key}:${index}`,
        `${name} · set ${index + 1}`,
        syncSetText(left, unit) + (left?.notes ? ` · ${left.notes}` : ''),
        syncSetText(right, unit) + (right?.notes ? ` · ${right.notes}` : ''),
      );
    }
    add(`${key}:notes`, `${name} · note`, mine.notes.trim() || '–', theirs.notes.trim() || '–');
  }
  add('notes', 'Workout notes', local.notes.trim() || '–', remote.notes.trim() || '–');
  return differences;
}
