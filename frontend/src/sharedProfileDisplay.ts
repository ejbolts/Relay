import {
  bodyGoalKind,
  bodyGoalName,
  maintenanceRange,
  maintenanceStatus,
} from './bodyMeasurementHistory';
import { presenceStatus, presenceText } from './presenceStatus';
import { setKindOf } from './setFieldValues';
import { addDays, dayMonth, parseLocalDate } from './trainingSummary';
import type {
  FriendActivity,
  FriendStatus,
  ProfileVisibility,
  SharedBodyMeasurement,
  SharedGoals,
  SharedProfile,
  SharedProfileSummary,
  SharedWorkoutKind,
  TrackedSet,
} from './types';
import { localDateOf } from './utils';
import { formatWeight, type WeightUnit } from './weightUnits';

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

/**
 * The line under a people-search result's name: a public profile's @username, so people with the
 * same name can be told apart, or else how you are connected. The action button shows the
 * friendship itself.
 */
export function searchResultDetail(
  profile: SharedProfileSummary & { username?: string | null },
): string {
  return profile.username ? `@${profile.username}` : friendStatusLabel(profile);
}

/** “4 sets”, “2 warm-up sets”, or both counts when an exercise had each. */
export function sharedSetCount(sets: TrackedSet[]): string {
  const completed = sets.filter((item) => item.completed);
  const warmups = completed.filter((item) => setKindOf(item) === 'warmup').length;
  const working = completed.length - warmups;
  if (!working) return `${warmups} warm-up ${warmups === 1 ? 'set' : 'sets'}`;
  return `${working} ${working === 1 ? 'set' : 'sets'}`;
}

/** "3 Nov 2026". */
export function longDate(value: string): string {
  return parseLocalDate(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** When a request was made or a member blocked: "Asked 3 Nov 2026", "Sent …" or "Blocked …". */
export function connectionDate(kind: 'request' | 'sent' | 'blocked', since: string): string {
  const verb = { request: 'Asked', sent: 'Sent', blocked: 'Blocked' }[kind];
  return `${verb} ${longDate(localDateOf(since))}`;
}

/** A friend's line in the Friends list: what they are doing now, or their recent training. */
export function friendListDetail(
  friend: Pick<FriendActivity, 'presence' | 'recent_workout_count'>,
  now = Date.now(),
): string {
  return (
    presenceText(presenceStatus(friend.presence), now) ??
    `${plural(friend.recent_workout_count, 'workout')} in the last 30 days`
  );
}

/** A search result's or suggestion's friend action, or null for yourself and friends. */
export function friendAction(
  profile: Pick<SharedProfileSummary, 'is_you' | 'friend_status'>,
): { kind: 'add' | 'accept' | 'cancel'; label: string; primary: boolean } | null {
  if (profile.is_you || profile.friend_status === 'friends') return null;
  return {
    none: { kind: 'add' as const, label: 'Add friend', primary: true },
    incoming: { kind: 'accept' as const, label: 'Accept', primary: true },
    outgoing: { kind: 'cancel' as const, label: 'Cancel request', primary: false },
  }[profile.friend_status];
}

/** The pill a profile's friend control shows once you are connected or have asked. */
export function friendPill(status: FriendStatus): 'Friends' | 'Requested' | null {
  return status === 'friends' ? 'Friends' : status === 'outgoing' ? 'Requested' : null;
}

/** What scanning a friend QR code did: sent a request, accepted theirs, or could not send. */
export interface InviteResult {
  kind: 'sent' | 'friends' | 'failed' | 'undo-failed';
  name: string;
  serial: number;
}

export function inviteMessage(result: InviteResult): string {
  if (result.kind === 'sent') return `Friend request sent to ${result.name}`;
  if (result.kind === 'friends') return `You and ${result.name} are now friends`;
  if (result.kind === 'undo-failed')
    return 'Could not cancel the request. Try again from the menu.';
  return 'Could not send the friend request. Tap Add friend to try again.';
}

/** An invite sends a request to someone you aren't connected to, or accepts their request. */
export function inviteSendsRequest(profile: Pick<SharedProfile, 'is_you' | 'friend_status'>) {
  return (
    !profile.is_you && (profile.friend_status === 'none' || profile.friend_status === 'incoming')
  );
}

export const SHARING_LOCKED = {
  title: 'Share your profile to see others',
  inviteTitle: 'Share your profile to add friends',
  body: 'Your profile is private. Share it with friends or everyone in Settings to see and add other members as friends; your workouts and profile photo are always part of it.',
  action: 'Choose who can see your profile',
};

export function blockConfirmation(name: string): { title: string; body: string } {
  return {
    title: `Block ${name}?`,
    body: 'They will no longer find you or see your profile, data and activity, and you stop being friends. You can unblock them in Social, under Friends.',
  };
}

/** A profile you blocked, or one that can no longer be opened. */
export function unavailableProfile(
  state: 'blocked' | 'missing',
  name: string,
  invite: boolean,
): { kicker: string; title: string; body: string } {
  if (state === 'blocked')
    return {
      kicker: 'BLOCKED',
      title: `You blocked ${name}`,
      body: 'They can no longer find you or see your profile.',
    };
  return invite
    ? {
        kicker: 'FRIEND INVITE',
        title: 'This invite can’t be opened',
        body: 'Its owner’s profile is private, or the link is no longer valid.',
      }
    : {
        kicker: 'SHARING',
        title: 'This profile is no longer shared',
        body: 'Its owner has made it private, so their training is hidden again.',
      };
}

/** A friends-only profile you can't see yet: why, and what to do. */
export function friendsOnlyNotice(
  profile: Pick<SharedProfileSummary, 'display_name' | 'friend_status'>,
): { title: string; body: string } {
  const name = profile.display_name;
  if (profile.friend_status === 'outgoing')
    return {
      title: 'Friend request sent',
      body: `Their workouts appear here once ${name} accepts your request.`,
    };
  if (profile.friend_status === 'incoming')
    return {
      title: `${name} sent you a friend request`,
      body: 'Accept it to see each other’s training.',
    };
  return {
    title: `Add ${name} as a friend to see their training`,
    body: `${name} shares with friends only. Send a friend request and their workouts appear here once they accept.`,
  };
}

/** A viewable profile's three headline numbers. */
export function profileStats(
  profile: Pick<
    SharedProfileSummary,
    'strength_workout_count' | 'workout_count' | 'recent_workout_count' | 'last_workout_date'
  >,
): Array<{ label: string; value: string }> {
  return [
    {
      label: 'Workouts',
      value: (profile.strength_workout_count ?? profile.workout_count ?? 0).toLocaleString('en-GB'),
    },
    { label: 'Last 30 days', value: String(profile.recent_workout_count ?? 0) },
    {
      label: 'Last workout',
      value: profile.last_workout_date ? dayMonth(profile.last_workout_date) : '–',
    },
  ];
}

export type SharedHistoryTab = 'all' | 'workouts' | 'cardio';

/**
 * A profile's history tabs. One list in every tab; the server leaves out cardio-only workouts
 * under Workouts and keeps only those under Cardio.
 */
export const SHARED_HISTORY_TABS: readonly (readonly [SharedHistoryTab, string])[] = [
  ['all', 'All sessions'],
  ['workouts', 'Workouts'],
  ['cardio', 'Cardio'],
];

export const SHARED_HISTORY_KIND: Record<SharedHistoryTab, SharedWorkoutKind | undefined> = {
  all: undefined,
  workouts: 'strength',
  cardio: 'cardio',
};

export function sharedHistoryEmpty(kind: SharedWorkoutKind | undefined, filtered: boolean): string {
  if (kind === 'cardio')
    return filtered ? 'No cardio sessions match these filters.' : 'No cardio sessions yet.';
  return filtered ? 'No workouts match these filters.' : 'No workouts logged yet.';
}

/** The days a shared profile's body-weight chart and change cover. */
export const BODY_WEIGHT_CHART_DAYS = 90;

/** A shared profile's latest weigh-in, its last 90 days (oldest first) and the change over them. */
export function sharedBodyWeight(measurements: SharedBodyMeasurement[]) {
  const latest = measurements[0];
  if (!latest) return null;
  const earliest = addDays(latest.measurement_date, -BODY_WEIGHT_CHART_DAYS);
  const recent = measurements
    .filter((item) => item.measurement_date >= earliest)
    .map((item) => ({ date: item.measurement_date, value: item.weight_kg }))
    .reverse();
  return {
    latest,
    recent,
    latestFat: measurements.find((item) => item.body_fat_pct !== null)?.body_fat_pct ?? null,
    change: recent.length > 1 ? recent[recent.length - 1].value - recent[0].value : null,
  };
}

/** "+1.2 kg", "−0.4 kg" or "0 kg". */
export function signedWeightChange(change: number, unit: WeightUnit): string {
  return `${change > 0 ? '+' : change < 0 ? '−' : ''}${formatWeight(Math.abs(change), unit, 1)}`;
}

/** What a shared profile's Goals card says about its body-weight goal and cardio targets. */
export function sharedGoalsSummary(
  goals: SharedGoals,
  latestWeight: number | null,
  unit: WeightUnit,
) {
  const goal = goals.body_weight;
  const span =
    goal && bodyGoalKind(goal) !== 'maintain' ? goal.start_weight_kg - goal.target_weight_kg : 0;
  const progress =
    goal && latestWeight !== null && span !== 0
      ? (goal.start_weight_kg - latestWeight) / span
      : null;
  return {
    bodyWeight: goal
      ? {
          text:
            bodyGoalKind(goal) === 'maintain'
              ? `${bodyGoalName(goal, unit)} until ${longDate(goal.target_date)}`
              : `${formatWeight(goal.start_weight_kg, unit, 1)} → ${formatWeight(goal.target_weight_kg, unit, 1)} by ${longDate(goal.target_date)}`,
          status:
            latestWeight !== null && maintenanceRange(goal)
              ? maintenanceStatus(goal, latestWeight)
              : null,
          progress,
          progressText:
            progress === null
              ? null
              : `${Math.round(Math.min(Math.max(progress, 0), 1) * 100)}% of the way`,
        }
      : null,
    cardio: (goals.cardio_goals ?? [{ zone: 2, ...goals.zone2 }]).map((item) => ({
      zone: item.zone,
      text: `Zone ${item.zone} · ${item.completed_minutes} of ${item.goal_minutes} min this week`,
    })),
  };
}
