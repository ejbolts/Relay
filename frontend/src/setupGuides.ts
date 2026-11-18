import { useSyncExternalStore } from 'react';
import type { TipId } from './tipsState';
import type { TrackedWorkout } from './types';

/** A walkthrough inside a feature's own screens that ends with the feature saved and set up. */
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

const real = (workouts: TrackedWorkout[]) => workouts.filter((workout) => !workout.is_sample);

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

/** What a guide says about your own training, worked out once when it starts. */
export interface GuideFacts {
  lift: FavouriteLift | null;
  rotation: string[];
}

export interface ActiveGuide {
  id: SetupGuideId;
  facts: GuideFacts;
  /** Splits: a saved split still to be made active, after the editor closes. */
  useRoutineId?: string;
}

let active: ActiveGuide | null = null;
const listeners = new Set<() => void>();
const finishedListeners = new Set<(id: SetupGuideId) => void>();

function emit(next: ActiveGuide | null) {
  active = next;
  for (const listener of listeners) listener();
}

/** The running guide, outside React. */
export const activeGuide = () => active;

export function startGuide(id: SetupGuideId, workouts: TrackedWorkout[]) {
  emit({ id, facts: { lift: favouriteLift(workouts), rotation: recentRotation(workouts) } });
}

export function updateGuide(id: SetupGuideId, change: Partial<Omit<ActiveGuide, 'id'>>) {
  if (active?.id === id) emit({ ...active, ...change });
}

/** Leaves a guide part way; nothing is marked as set up. */
export function exitGuide(id?: SetupGuideId) {
  if (active && (!id || active.id === id)) emit(null);
}

/** The feature was saved: the guide is complete. */
export function finishGuide(id: SetupGuideId) {
  if (active?.id !== id) return;
  emit(null);
  for (const listener of finishedListeners) listener(id);
}

export function onGuideFinished(listener: (id: SetupGuideId) => void): () => void {
  finishedListeners.add(listener);
  return () => finishedListeners.delete(listener);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The running guide, or only the named one when an id is given. */
export function useActiveGuide(id?: SetupGuideId): ActiveGuide | null {
  const current = useSyncExternalStore(
    subscribe,
    () => active,
    // Nothing runs a guide while the page is rendered on the server.
    () => null,
  );
  return current && (!id || current.id === id) ? current : null;
}
