import { addDays, parseLocalDate, shortDate } from './trainingSummary';
import type { FriendFeedItem, WorkoutReactionKind, WorkoutReactions } from './types';
import { formatMinutesDuration } from './utils';

export const REACTIONS: ReadonlyArray<{ kind: WorkoutReactionKind; emoji: string; label: string }> =
  [
    { kind: 'like', emoji: '👍', label: 'Like' },
    { kind: 'love', emoji: '❤️', label: 'Love' },
    { kind: 'strong', emoji: '💪', label: 'Strong' },
    { kind: 'fire', emoji: '🔥', label: 'Fire' },
    { kind: 'clap', emoji: '👏', label: 'Applause' },
    { kind: 'trophy', emoji: '🏆', label: 'Trophy' },
  ];

export function reactionEmoji(kind: WorkoutReactionKind): string {
  return REACTIONS.find((item) => item.kind === kind)?.emoji ?? '';
}

export interface FriendSession {
  cardio: boolean;
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
