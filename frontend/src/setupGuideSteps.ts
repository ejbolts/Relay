import { SPLIT_GUIDE_COPY } from './splitGuideCopy';
import type { TipId } from './tipDefinitions';
import type { TrackedWorkout } from './types';

/**
 * The setup guides' rules and wording, shared by the web, which coaches inside each feature's own
 * screens, and the app, which steps through them in a sheet before opening the feature.
 */

/** A walkthrough inside a feature's own screens that ends with the feature saved and set up. */
export type SetupGuideId = 'normalise' | 'blocks' | 'split';

export const SETUP_GUIDE_IDS: SetupGuideId[] = ['normalise', 'blocks', 'split'];

export const SETUP_GUIDE_TITLES: Record<SetupGuideId, string> = {
  normalise: 'Compare machines',
  blocks: 'Training blocks',
  split: 'Splits and rep ranges',
};

/** Tips whose feature has a guide; the tip's button opens the guide instead of the feature. */
export const GUIDE_FOR_TIP: Partial<Record<TipId, SetupGuideId>> = {
  normalise: 'normalise',
  blocks: 'blocks',
  split: 'split',
  repRange: 'split',
};

/** The tips a finished guide has taught, so they stop suggesting the feature. */
export const GUIDE_TIPS: Record<SetupGuideId, TipId[]> = {
  normalise: ['normalise'],
  blocks: ['blocks'],
  split: ['split', 'repRange'],
};

/** Whether the feature a guide sets up is already in use. */
export function guideDone(
  id: SetupGuideId,
  seen: Partial<Record<TipId, string>>,
  hasBlocks: boolean,
): boolean {
  if (id === 'normalise') return seen.normalise === 'learned';
  if (id === 'blocks') return hasBlocks || seen.blocks === 'learned';
  return seen.split === 'learned' && seen.repRange === 'learned';
}

/** Comparing machines needs one exercise logged on two saved machines first. */
export const NORMALISE_GUIDE_WAIT = {
  title: 'Compare machines',
  body: 'This needs one exercise logged on two saved machines. Save a machine photo on an exercise while you log it, then use the other machine next time.',
} as const;

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

export const guideFacts = (workouts: TrackedWorkout[]): GuideFacts => ({
  lift: favouriteLift(workouts),
  rotation: recentRotation(workouts),
});

export interface GuideStepCopy {
  title: string;
  body: string;
}

/** The training blocks guide, in the order of the block form. */
export function blocksGuideSteps(lift: FavouriteLift | null): GuideStepCopy[] {
  return [
    {
      title: 'Name this phase',
      body: 'Something like Strength or Summer cut. Your first session of each lift in a block sets a fresh baseline, so you can earn Block PRs below your all-time best.',
    },
    {
      title: 'Pick a start',
      body: 'Today, 1 January, or Custom for a past date so recent workouts count towards this block.',
    },
    {
      title: 'Plan an end, if you like',
      body: 'Home counts down the days left. A block never closes by itself.',
    },
    {
      title: 'Start the block',
      body: lift
        ? `Home then shows the week you’re on, and ${lift.name} records start fresh from your next session.`
        : 'Home then shows the week you’re on, and records start fresh from your next session.',
    },
  ];
}

/**
 * The split guide, from choosing a template to making the split active. `weight` formats the
 * favourite lift's latest top set in the person's unit.
 */
export function splitGuideSteps(
  facts: GuideFacts,
  weight: (kg: number) => string,
): GuideStepCopy[] {
  const { lift, rotation } = facts;
  return [
    {
      title: SPLIT_GUIDE_COPY.template.title,
      body:
        rotation.length >= 2
          ? `Your recent workouts went ${rotation.join(', ')}. Pick the closest template, or New split to build your own.`
          : SPLIT_GUIDE_COPY.template.body,
    },
    SPLIT_GUIDE_COPY.plan,
    {
      title: SPLIT_GUIDE_COPY.reps.title,
      body: lift
        ? `Choose Reps on an exercise. With 8–12, stay at ${weight(lift.latestTopKg)} on ${lift.name} until every top set reaches 12 reps, then add weight. Relay says which while you log.`
        : SPLIT_GUIDE_COPY.reps.body,
    },
    SPLIT_GUIDE_COPY.save,
    SPLIT_GUIDE_COPY.use,
    SPLIT_GUIDE_COPY.confirm,
  ];
}
