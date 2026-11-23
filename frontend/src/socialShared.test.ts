import { describe, expect, it } from 'vitest';
import {
  canSendComment,
  clampComment,
  commentLength,
  commentThreads,
  COMMENT_MAX_LENGTH,
  deleteCommentMessage,
} from './commentDisplay';
import { averagePerWeek, firstTrainingDay } from './consistencyWeeks';
import { FEED_SHOWN_EXERCISES, feedExercises, feedStats, firstName } from './friendFeedData';
import { friendInviteIdFromScan, friendInviteLink } from './friendInviteLink';
import { presenceDot } from './presenceStatus';
import {
  connectionDate,
  friendAction,
  friendListDetail,
  friendPill,
  friendsOnlyNotice,
  inviteMessage,
  inviteSendsRequest,
  profileStats,
  sharedBodyWeight,
  sharedGoalsSummary,
  sharedHistoryEmpty,
  signedWeightChange,
  unavailableProfile,
} from './sharedProfileDisplay';
import {
  choicesFrom,
  livePreview,
  PRIVATE_DEFAULTS,
  savesAtOnce,
  visibilityPending,
  withVisibility,
} from './sharingChoices';
import type {
  HeatmapDay,
  SharingSettings,
  TrackedMovement,
  TrackedWorkout,
  WorkoutComment,
} from './types';

// The rules Social's web screens and the app share (see "Web and mobile parity" in AGENTS.md).

function movement(name: string, completed = true): TrackedMovement {
  return {
    id: name,
    order_index: 0,
    exercise: { id: name, name, kind: 'strength' },
    machine_photos: [],
    sets: [{ id: `${name}-1`, reps: 5, weight_kg: 100, completed }],
  } as unknown as TrackedMovement;
}

function workout(overrides: Partial<TrackedWorkout>): TrackedWorkout {
  return {
    id: 'w',
    name: 'Push',
    category: 'push',
    workout_date: '2026-11-20',
    duration_minutes: 45,
    movements: [movement('Bench Press'), movement('Dips')],
    ...overrides,
  } as TrackedWorkout;
}

describe('feed cards', () => {
  it('summarise a strength session as duration, sets and volume', () => {
    expect(feedStats(workout({}), 'kg')).toEqual(['45min', '2 sets', '1,000 kg']);
  });

  it('list exercises with a completed set, but not a single exercise named like the session', () => {
    const listed = feedExercises(
      workout({ movements: [movement('Bench Press'), movement('Skipped', false)] }),
    );
    expect(listed.map((item) => item.exercise.name)).toEqual(['Bench Press']);
    expect(feedExercises(workout({ name: 'Running', movements: [movement('running')] }))).toEqual(
      [],
    );
    expect(FEED_SHOWN_EXERCISES).toBe(3);
  });

  it('name friends by their first name in the row of friends', () => {
    expect(firstName('  Alex Morgan ')).toBe('Alex');
    expect(firstName('Sam')).toBe('Sam');
  });
});

describe('comments', () => {
  const comment = (id: string, parent: string | null = null) =>
    ({ id, parent_id: parent }) as WorkoutComment;

  it('count emoji once and stop at the limit', () => {
    expect(commentLength('💪💪')).toBe(2);
    expect(commentLength(clampComment('a'.repeat(COMMENT_MAX_LENGTH + 5)))).toBe(
      COMMENT_MAX_LENGTH,
    );
    expect(canSendComment('   ')).toBe(false);
    expect(canSendComment('Nice')).toBe(true);
  });

  it('group replies under their comment, and warn when deleting removes replies', () => {
    const items = [comment('a'), comment('b'), comment('r', 'a')];
    expect(commentThreads(items).map(({ root, replies }) => [root.id, replies.length])).toEqual([
      ['a', 1],
      ['b', 0],
    ]);
    expect(deleteCommentMessage(items, items[0])).toContain('and its replies');
    expect(deleteCommentMessage(items, items[1])).toBe('This comment will be permanently deleted.');
  });
});

describe('friend links', () => {
  it('keep the #friend=<account id> format, and read codes from any of the server’s addresses', () => {
    const link = friendInviteLink('d7131000-7937-40be', 'https://gym.example.com', 'code 1');
    expect(link).toBe('https://gym.example.com/#friend=d7131000-7937-40be&invite=code%201');
    expect(friendInviteIdFromScan(link)).toBe('d7131000-7937-40be');
    expect(friendInviteIdFromScan('http://127.0.0.1:8000/#friend=abc')).toBe('abc');
    expect(friendInviteIdFromScan('ftp://gym.example.com/#friend=abc')).toBeNull();
    expect(friendInviteIdFromScan('not a link')).toBeNull();
  });
});

describe('friends and profiles', () => {
  const summary = {
    display_name: 'Sam',
    is_you: false,
    friend_status: 'none' as const,
  };

  it('offer the friend action that fits, and pills once connected', () => {
    expect(friendAction(summary)?.label).toBe('Add friend');
    expect(friendAction({ ...summary, friend_status: 'incoming' })?.kind).toBe('accept');
    expect(friendAction({ ...summary, friend_status: 'outgoing' })?.primary).toBe(false);
    expect(friendAction({ ...summary, friend_status: 'friends' })).toBeNull();
    expect(friendAction({ ...summary, is_you: true })).toBeNull();
    expect(friendPill('friends')).toBe('Friends');
    expect(friendPill('outgoing')).toBe('Requested');
    expect(friendPill('none')).toBeNull();
  });

  it('send an invite only to someone you are not connected to', () => {
    expect(inviteSendsRequest(summary)).toBe(true);
    expect(inviteSendsRequest({ ...summary, friend_status: 'incoming' })).toBe(true);
    expect(inviteSendsRequest({ ...summary, friend_status: 'friends' })).toBe(false);
    expect(inviteSendsRequest({ ...summary, is_you: true })).toBe(false);
    expect(inviteMessage({ kind: 'sent', name: 'Sam', serial: 1 })).toBe(
      'Friend request sent to Sam',
    );
    expect(inviteMessage({ kind: 'friends', name: 'Sam', serial: 1 })).toBe(
      'You and Sam are now friends',
    );
  });

  it('explain a friends-only profile and one that can no longer be opened', () => {
    expect(friendsOnlyNotice({ ...summary, friend_status: 'outgoing' }).title).toBe(
      'Friend request sent',
    );
    expect(friendsOnlyNotice(summary).title).toBe('Add Sam as a friend to see their training');
    expect(unavailableProfile('blocked', 'Sam', false).title).toBe('You blocked Sam');
    expect(unavailableProfile('missing', '', true).kicker).toBe('FRIEND INVITE');
  });

  it('describe requests, friends and profile numbers', () => {
    expect(connectionDate('sent', '2026-11-03T10:00:00')).toBe('Sent 3 Nov 2026');
    expect(friendListDetail({ presence: null, recent_workout_count: 1 })).toBe(
      '1 workout in the last 30 days',
    );
    expect(
      friendListDetail({
        presence: { online: true, last_active_at: null, workout: null },
        recent_workout_count: 4,
      }),
    ).toBe('Active now');
    expect(
      profileStats({
        strength_workout_count: 1204,
        workout_count: 1300,
        recent_workout_count: 6,
        last_workout_date: '2026-11-20',
      }).map((stat) => stat.value),
    ).toEqual(['1,204', '6', '20 Nov']);
    expect(sharedHistoryEmpty('cardio', false)).toBe('No cardio sessions yet.');
    expect(sharedHistoryEmpty(undefined, true)).toBe('No workouts match these filters.');
  });

  it('summarise shared body weight over 90 days, and body-weight goals', () => {
    const body = sharedBodyWeight([
      { measurement_date: '2026-11-20', weight_kg: 80, body_fat_pct: null },
      { measurement_date: '2026-10-01', weight_kg: 82, body_fat_pct: 18 },
      { measurement_date: '2026-01-01', weight_kg: 90, body_fat_pct: null },
    ]);
    expect(body?.change).toBe(-2);
    expect(body?.latestFat).toBe(18);
    expect(signedWeightChange(-2, 'kg')).toBe('−2 kg');
    expect(sharedBodyWeight([])).toBeNull();

    const goals = sharedGoalsSummary(
      {
        body_weight: {
          start_date: '2026-10-01',
          start_weight_kg: 84,
          target_weight_kg: 80,
          target_date: '2026-12-31',
        },
        zone2: { goal_minutes: 150, completed_minutes: 30 },
      } as never,
      82,
      'kg',
    );
    expect(goals.bodyWeight?.progressText).toBe('50% of the way');
    expect(goals.cardio.map((item) => item.text)).toEqual(['Zone 2 · 30 of 150 min this week']);
  });
});

describe('consistency', () => {
  it('starts the average at the first training day', () => {
    const day = (workout_date: string, workout_count: number) =>
      ({ workout_date, workout_count }) as HeatmapDay;
    expect(
      firstTrainingDay([day('2026-11-03', 1), day('2026-10-01', 0), day('2026-10-20', 2)]),
    ).toBe('2026-10-20');
    expect(firstTrainingDay([])).toBeUndefined();
    expect(averagePerWeek(7, 2)).toBe('3.5');
  });
});

describe('sharing choices', () => {
  const saved = {
    ...PRIVATE_DEFAULTS,
    visibility: 'public',
    pending_requests: 0,
  } as SharingSettings;

  it('keep a new visibility as a draft until confirmed, and cancel it by choosing the saved one', () => {
    const draft = withVisibility(saved, choicesFrom(saved), 'followers');
    expect(visibilityPending(saved, draft)).toBe(true);
    expect(savesAtOnce(saved, draft)).toBe(false);
    expect(withVisibility(saved, draft, 'public')).toEqual(choicesFrom(saved));
    expect(savesAtOnce(saved, choicesFrom(saved))).toBe(true);
    // A private profile saves nothing until it chooses who can see it.
    const privateSaved = { ...saved, visibility: 'private' } as SharingSettings;
    expect(savesAtOnce(privateSaved, choicesFrom(privateSaved))).toBe(false);
  });

  it('preview what friends see live', () => {
    const live = { name: 'Push', kind: 'strength' as const, started_at: '2026-11-20T10:00:00Z' };
    expect(livePreview(choicesFrom(saved), live).text).toBe('Working out · Push');
    expect(livePreview(choicesFrom(saved), null).text).toBe('Active now');
    expect(livePreview(PRIVATE_DEFAULTS, live).text).toBe('No live activity');
    expect(presenceDot(livePreview(choicesFrom(saved), null).status)).toBe('online');
  });
});
