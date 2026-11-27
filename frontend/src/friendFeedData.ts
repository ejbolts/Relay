import {
  addDays,
  formatVolume,
  parseLocalDate,
  shortDate,
  strengthSets,
  workoutVolumeKg,
} from './trainingSummary';
import type {
  FriendFeedItem,
  TrackedMovement,
  TrackedWorkout,
  WorkoutReactionKind,
  WorkoutReactions,
} from './types';
import { formatMinutesDuration } from './utils';
import type { WeightUnit } from './weightUnits';

export const REACTIONS: ReadonlyArray<{ kind: WorkoutReactionKind; emoji: string; label: string }> =
  [
    { kind: 'like', emoji: '👍', label: 'Like' },
    { kind: 'love', emoji: '❤️', label: 'Love' },
    { kind: 'strong', emoji: '💪', label: 'Strong' },
    { kind: 'fire', emoji: '🔥', label: 'Fire' },
    { kind: 'clap', emoji: '👏', label: 'Applause' },
    { kind: 'run', emoji: '🏃', label: 'Run' },
    { kind: 'trophy', emoji: '🏆', label: 'Trophy' },
  ];

export function reactionEmoji(kind: WorkoutReactionKind): string {
  return REACTIONS.find((item) => item.kind === kind)?.emoji ?? '';
}

export interface FriendSession {
  cardio: boolean;
  /** Workout name alone. */
  name: string;
  /** Workout name and logged duration. */
  title: string;
  /** Completed sets for strength, or distance for cardio. */
  detail: string | null;
}

/** A one-row summary of a friend's latest workout or cardio session. */
export function friendSession(workout: FriendFeedItem['workout']): FriendSession {
  const cardio =
    workout.category === 'cardio' ||
    (workout.movements.length > 0 &&
      workout.movements.every((movement) => movement.exercise.kind === 'cardio'));
  const completed = workout.movements.flatMap((movement) =>
    movement.sets.filter((item) => item.completed),
  );
  const distance = completed.reduce((total, item) => total + (item.distance_km ?? 0), 0);
  // Sessions from the Cardio screen are named "<exercise> cardio"; the Cardio label already says so.
  const name = cardio ? workout.name.replace(/ cardio$/i, '') : workout.name;
  return {
    cardio,
    name,
    title: [name, workout.duration_minutes ? formatMinutesDuration(workout.duration_minutes) : null]
      .filter(Boolean)
      .join(' · '),
    detail: cardio
      ? distance > 0
        ? `${Number(distance.toFixed(1))} km`
        : null
      : `${completed.length} ${completed.length === 1 ? 'set' : 'sets'}`,
  };
}

/** Today, Yesterday, a weekday within the last week, or a short date. */
export function relativeDay(value: string, today: string): string {
  const days = Math.round(
    (parseLocalDate(today).getTime() - parseLocalDate(value).getTime()) / 86_400_000,
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7)
    return parseLocalDate(value).toLocaleDateString('en-GB', { weekday: 'short' });
  return shortDate(value);
}

/** The saved timestamp is UTC, including older SQLite responses without an offset. */
export function loggedTime(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** The last seven days, oldest first, ending with `today`. */
export function lastWeek(today: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
}

/** The most used reactions (up to three) and the total, for a compact summary. */
export function reactionSummary(counts: WorkoutReactions['counts']) {
  const sorted = [...counts].sort((left, right) => right.count - left.count);
  return {
    emojis: sorted.slice(0, 3).map((item) => reactionEmoji(item.reaction)),
    total: counts.reduce((total, item) => total + item.count, 0),
  };
}

/** The reaction a tap should leave: choosing your current reaction again removes it. */
export function nextReaction(
  current: WorkoutReactionKind | null,
  chosen: WorkoutReactionKind,
): WorkoutReactionKind | null {
  return current === chosen ? null : chosen;
}

/**
 * A feed card's summary line: duration, then distance for cardio or sets and volume for
 * strength. Each value carries its own unit, so none needs a label.
 */
export function feedStats(workout: TrackedWorkout, weightUnit: WeightUnit): string[] {
  const session = friendSession(workout);
  const sets = strengthSets(workout).length;
  const volume = workoutVolumeKg(workout);
  const stats: string[] = [];
  if (workout.duration_minutes) stats.push(formatMinutesDuration(workout.duration_minutes));
  if (session.cardio) {
    if (session.detail) stats.push(session.detail);
  } else {
    if (sets) stats.push(`${sets} ${sets === 1 ? 'set' : 'sets'}`);
    if (volume > 0) stats.push(formatVolume(volume, weightUnit));
  }
  return stats;
}

/** Exercises listed on a feed card before the rest collapse behind a toggle. */
export const FEED_SHOWN_EXERCISES = 3;

/**
 * The exercises a feed card lists: those with a completed set. A session of one exercise named
 * after it (a run called "Running") lists none.
 */
export function feedExercises(workout: TrackedWorkout): TrackedMovement[] {
  const name = friendSession(workout).name.toLocaleLowerCase();
  const movements = workout.movements.filter((movement) =>
    movement.sets.some((item) => item.completed),
  );
  const listed =
    movements.length > 1 ||
    (movements.length === 1 && movements[0].exercise.name.toLocaleLowerCase() !== name);
  return listed ? movements : [];
}

export interface FeedExerciseView {
  /** Exercises shown on the card right now: the first three, or every exercise once expanded. */
  listed: TrackedMovement[];
  /** Exercises hidden while collapsed; zero when the workout already fits in the compact list. */
  extra: number;
  /** Whether the card can expand and collapse its exercise list inline. */
  canExpand: boolean;
  /** Visible text for the expand/collapse control, or null when every exercise already fits. */
  toggleText: string | null;
  /** Accessible label naming the workout so cards in the feed stay distinct. */
  toggleLabel: string | null;
}

/** Which exercises a feed card shows and its inline "+N exercises" / "Show less" toggle. */
export function feedExerciseView(
  movements: TrackedMovement[],
  expanded: boolean,
  subject: string,
): FeedExerciseView {
  const extra = Math.max(0, movements.length - FEED_SHOWN_EXERCISES);
  const canExpand = extra > 0;
  const listed = canExpand && !expanded ? movements.slice(0, FEED_SHOWN_EXERCISES) : movements;
  if (!canExpand) {
    return { listed, extra: 0, canExpand: false, toggleText: null, toggleLabel: null };
  }
  const noun = extra === 1 ? 'exercise' : 'exercises';
  return {
    listed,
    extra,
    canExpand: true,
    toggleText: expanded ? 'Show less' : `+${extra} ${noun}`,
    toggleLabel: expanded
      ? `Show fewer exercises in ${subject}`
      : `Show ${extra} more ${noun} in ${subject}`,
  };
}

/** "Alex" from "Alex Morgan", for the feed's row of friends. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
