import { multiMachineExerciseId } from './machineUsage';
import { daysBetween } from './trainingSummary';
import { TIP_DEFINITIONS, type TipId, type TipState } from './tipsState';
import type { TrackedWorkout } from './types';

/** The most new tips Home's bulb counts out loud; beyond it, it says "9+". */
export const COUNTED_TIPS = 9;

export const homeTipCount = (unread: number) =>
  unread > COUNTED_TIPS ? `${COUNTED_TIPS}+` : String(unread);

/** What Home's tips depend on, worked out from the account's own training. */
export interface HomeTipFacts {
  /** An exercise logged on two saved machines, which Machine weights can compare. */
  machineExerciseId: string | null;
  /** Weeks with at least one workout. */
  weeks: number;
  /** Workouts logged, leaving out the sample workout. */
  workouts: number;
  /** Null while the blocks are loading or could not load. */
  blockCount: number | null;
  hasSplit: boolean;
  /** The latest weigh-in has reached the active loss or gain goal. */
  goalReached: boolean;
  /** The account is at least a week old. */
  oldEnough: boolean;
}

export function homeTipFacts({
  workouts,
  createdAt,
  today,
  blockCount,
  hasSplit,
  goalReached,
}: {
  workouts: TrackedWorkout[];
  createdAt?: string;
  /** Today's local date, as YYYY-MM-DD. */
  today: string;
  blockCount: number | null;
  hasSplit: boolean;
  goalReached: boolean;
}): HomeTipFacts {
  const real = workouts.filter((workout) => !workout.is_sample);
  const weeks = new Set(
    real.map((workout) => {
      const date = new Date(`${workout.workout_date}T12:00:00`);
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      return date.toISOString().slice(0, 10);
    }),
  ).size;
  return {
    // Comparing machines only helps once one exercise has been logged on two of them.
    machineExerciseId: multiMachineExerciseId(real),
    weeks,
    workouts: real.length,
    blockCount,
    hasSplit,
    goalReached,
    oldEnough: !!createdAt && daysBetween(createdAt.slice(0, 10), today) >= 7,
  };
}

/**
 * The tips Home lists, most useful first: features that change what the app can tell you, then
 * personal touches. Tips already learned, dismissed or put away with Got it are left out.
 */
export function homeTipList(facts: HomeTipFacts, state: TipState): TipId[] {
  const pool: TipId[] = [
    ...(facts.machineExerciseId ? ['normalise' as const] : []),
    ...(facts.weeks >= 4 && facts.blockCount === 0 ? ['blocks' as const] : []),
    ...(facts.workouts >= 3 && !facts.hasSplit ? ['split' as const] : []),
    ...(facts.hasSplit && facts.weeks >= 3 ? ['repRange' as const] : []),
    ...(facts.goalReached ? ['maintenance' as const] : []),
    ...(facts.oldEnough ? ['home' as const] : []),
    'friends',
    'appearance',
  ];
  const done = state.homeDone ?? [];
  return pool.filter(
    (id) => state.seen[id] !== 'learned' && state.seen[id] !== 'dismissed' && !done.includes(id),
  );
}

/** Home's wording for a tip, or the caught-up message when there are none. */
export function homeTipCopy(id: TipId | undefined): { title: string; body: string } {
  if (!id) {
    return {
      title: "You're all caught up",
      body: 'New tips appear here as you use more of Relay.',
    };
  }
  const tip = TIP_DEFINITIONS[id];
  return { title: tip.title, body: 'homeBody' in tip ? tip.homeBody : tip.body };
}
