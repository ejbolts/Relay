import { setKindOf } from './setFieldValues';
import type { ProfileVisibility, SharedProfileSummary, TrackedSet } from './types';

export const SHARED_WORKOUT_PAGE_SIZE = 10;

export const VISIBILITY_LABELS: Record<ProfileVisibility, string> = {
  private: 'Private',
  followers: 'Friends only',
  public: 'Public',
};

export function plural(count: number, word: string): string {
  return `${count.toLocaleString('en-GB')} ${word}${count === 1 ? '' : 's'}`;
}

/** "Since Oct 2026" for a relationship start date, or null when it is unknown. */
export function sinceMonthLabel(since?: string | null): string | null {
  const date = since ? new Date(since) : null;
  return date && !Number.isNaN(date.getTime())
    ? `Since ${date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
    : null;
}

/** What a viewable profile shares: workouts and cardio always, then the optional parts chosen. */
export function sharedParts(profile: SharedProfileSummary): string[] {
  const shares = profile.shares;
  if (!shares) return [];
  return [
    'Workouts + cardio',
    ...(shares.machine_photos ? ['Machine photos'] : []),
    ...(shares.body_weight ? ['Body weight'] : []),
    ...(shares.goals ? ['Goals'] : []),
    ...(shares.notes ? ['Notes'] : []),
  ];
}

/** A person's relationship to you, or who can see their profile when you are not connected. */
export function friendStatusLabel(profile: SharedProfileSummary): string {
  switch (profile.friend_status) {
    case 'friends':
      return 'Friend';
    case 'incoming':
      return 'Sent you a friend request';
    case 'outgoing':
      return 'Friend request sent';
    default:
      return VISIBILITY_LABELS[profile.visibility];
  }
}

/** “4 sets”, “2 warm-up sets”, or both counts when an exercise had each. */
export function sharedSetCount(sets: TrackedSet[]): string {
  const completed = sets.filter((item) => item.completed);
  const warmups = completed.filter((item) => setKindOf(item) === 'warmup').length;
  const working = completed.length - warmups;
  if (!working) return `${warmups} warm-up ${warmups === 1 ? 'set' : 'sets'}`;
  return `${working} ${working === 1 ? 'set' : 'sets'}`;
}
