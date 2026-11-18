import type { TipId } from './tipsState';
import type { TrackedWorkout } from './types';

/** A walkthrough that explains a feature with your own data, then opens it to set it up. */
export type SetupGuideId = 'normalise' | 'blocks' | 'split';

export const SETUP_GUIDE_IDS: SetupGuideId[] = ['normalise', 'blocks', 'split'];

/** Tips whose feature has a guide; the tip's button opens the guide instead of the feature. */
export const GUIDE_FOR_TIP: Partial<Record<TipId, SetupGuideId>> = {
  normalise: 'normalise',
  blocks: 'blocks',
  split: 'split',
  repRange: 'split',
};

const EVENT = 'relay:setup-guide';

export function openSetupGuide(id: SetupGuideId) {
  window.dispatchEvent(new CustomEvent<SetupGuideId>(EVENT, { detail: id }));
}

export function onSetupGuide(listener: (id: SetupGuideId) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<SetupGuideId>).detail);
  window.addEventListener(EVENT, handle);
  return () => window.removeEventListener(EVENT, handle);
}

export interface GuideMachine {
  id: string;
  caption: string;
  sessions: number;
  /** The heaviest working set logged on this machine. */
  topKg: number | null;
}

export interface MachineComparison {
  exerciseId: string;
  exerciseName: string;
  /** Most-used first, so the first is the natural reference. */
  machines: GuideMachine[];
}

const real = (workouts: TrackedWorkout[]) => workouts.filter((workout) => !workout.is_sample);

/** The machines one exercise has been logged on, with sessions and top weight on each. */
export function machineComparison(
  workouts: TrackedWorkout[],
  exerciseId: string,
): MachineComparison | null {
  let exerciseName = '';
  const machines = new Map<string, { caption: string; sessions: number; topKg: number | null }>();
  for (const workout of real(workouts)) {
    for (const movement of workout.movements ?? []) {
      if (movement.exercise.id !== exerciseId) continue;
      exerciseName ||= movement.exercise.name?.trim() ?? '';
      const pinned = movement.machine_photos ?? [];
      const captions = new Map(pinned.map((photo) => [photo.id, photo.caption]));
      const used = new Set<string>();
      for (const set of movement.sets) {
        const id = set.machine_photo_id ?? pinned[0]?.id;
        if (!id) continue;
        used.add(id);
        const entry = machines.get(id) ?? { caption: '', sessions: 0, topKg: null };
        if (!set.warmup && set.weight_kg !== null && set.weight_kg > 0)
          entry.topKg = Math.max(entry.topKg ?? 0, set.weight_kg);
        machines.set(id, entry);
      }
      for (const photo of pinned) used.add(photo.id);
      for (const id of used) {
        const entry = machines.get(id) ?? { caption: '', sessions: 0, topKg: null };
        entry.sessions += 1;
        entry.caption ||= captions.get(id)?.trim() || '';
        machines.set(id, entry);
      }
    }
  }
  if (machines.size < 2) return null;
  const ordered = [...machines]
    .map(([id, entry]) => ({ id, ...entry }))
    .sort((a, b) => b.sessions - a.sessions);
  return {
    exerciseId,
    exerciseName: exerciseName || 'this exercise',
    machines: ordered.map((machine, index) => ({
      ...machine,
      caption: machine.caption || `Machine ${index + 1}`,
    })),
  };
}

export interface FavouriteLift {
  name: string;
  sessions: number;
  /** The heaviest working set in the most recent session. */
  latestTopKg: number;
  /** The heaviest working set ever logged. */
  bestKg: number;
}

/** The weighted exercise logged in the most sessions, to use as a worked example. */
export function favouriteLift(workouts: TrackedWorkout[]): FavouriteLift | null {
  const lifts = new Map<string, FavouriteLift & { latestDate: string }>();
  for (const workout of real(workouts)) {
    for (const movement of workout.movements ?? []) {
      if (movement.exercise.kind === 'cardio') continue;
      const weights = movement.sets
        .filter((set) => !set.warmup && set.weight_kg !== null && set.weight_kg > 0)
        .map((set) => set.weight_kg!);
      if (!weights.length) continue;
      const top = Math.max(...weights);
      const id = movement.exercise.id;
      const entry = lifts.get(id);
      if (!entry) {
        lifts.set(id, {
          name: movement.exercise.name,
          sessions: 1,
          latestTopKg: top,
          bestKg: top,
          latestDate: workout.workout_date,
        });
        continue;
      }
      entry.sessions += 1;
      entry.bestKg = Math.max(entry.bestKg, top);
      if (workout.workout_date >= entry.latestDate) {
        entry.latestDate = workout.workout_date;
        entry.latestTopKg = top;
      }
    }
  }
  let best: (FavouriteLift & { latestDate: string }) | null = null;
  for (const lift of lifts.values()) if (!best || lift.sessions > best.sessions) best = lift;
  if (!best) return null;
  const { name, sessions, latestTopKg, bestKg } = best;
  return { name, sessions, latestTopKg, bestKg };
}

const chronological = (workouts: TrackedWorkout[]) =>
  real(workouts).sort((a, b) =>
    a.workout_date === b.workout_date
      ? (a.created_at ?? '').localeCompare(b.created_at ?? '')
      : a.workout_date.localeCompare(b.workout_date),
  );

/** The names of the most recent workouts, oldest first, to show the order you train in. */
export function recentRotation(workouts: TrackedWorkout[], count = 5): string[] {
  return chronological(workouts)
    .filter((workout) => workout.name?.trim())
    .slice(-count)
    .map((workout) => workout.name.trim());
}

export interface WorkoutPlanExample {
  name: string;
  exercises: { name: string; sets: number }[];
}

/** The latest strength workout's exercises, to show what a planned split day holds. */
export function latestWorkoutPlan(
  workouts: TrackedWorkout[],
  limit = 3,
): WorkoutPlanExample | null {
  const latest = chronological(workouts)
    .reverse()
    .find((workout) =>
      (workout.movements ?? []).some(
        (movement) => movement.exercise.kind !== 'cardio' && movement.sets.length,
      ),
    );
  if (!latest) return null;
  const exercises = (latest.movements ?? [])
    .filter((movement) => movement.exercise.kind !== 'cardio' && movement.sets.length)
    .sort((a, b) => a.order_index - b.order_index)
    .map((movement) => ({
      name: movement.exercise.name,
      sets: movement.sets.filter((set) => !set.warmup).length || movement.sets.length,
    }));
  return { name: latest.name?.trim() || 'Workout', exercises: exercises.slice(0, limit) };
}
