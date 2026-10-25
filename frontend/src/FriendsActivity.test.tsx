// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { FriendsActivityCard } from './FriendsActivity';
import { friendSession, nextReaction, reactionSummary, relativeDay } from './friendFeedData';
import type { FriendFeedItem, TrackedWorkout } from './types';

const strength = {
  id: 'w1',
  name: 'Leg day',
  workout_date: '2026-10-19',
  category: 'lower',
  duration_minutes: 71,
  movements: [
    {
      id: 'm1',
      exercise: { kind: 'strength' },
      sets: [{ completed: true }, { completed: true }, { completed: false }],
    },
  ],
} as unknown as TrackedWorkout;
const cardio = {
  id: 'w2',
  name: 'Incline walk',
  workout_date: '2026-10-18',
  category: 'cardio',
  duration_minutes: 35,
  movements: [
    {
      id: 'm2',
      exercise: { kind: 'cardio' },
      sets: [{ completed: true, distance_km: 2.75 }],
    },
  ],
} as unknown as TrackedWorkout;
const jordan: FriendFeedItem = {
  friend: { id: 'jordan', display_name: 'Jordan Preview', profile_photo_url: null },
  workout: strength,
  reactions: {
    counts: [
      { reaction: 'like', count: 1 },
      { reaction: 'love', count: 2 },
    ],
    yours: null,
  },
};
const alex: FriendFeedItem = {
  friend: { id: 'alex', display_name: 'Alex Preview', profile_photo_url: null },
  workout: cardio,
  reactions: { counts: [], yours: null },
};

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const found = [...document.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === label || item.textContent === label,
  );
  expect(found, label).toBeTruthy();
  return found!;
}

async function render(onOpenFriend = vi.fn(), onOpenFriends = vi.fn()) {
  await act(async () =>
    root.render(
      <FriendsActivityCard
        active
        today="2026-10-19"
        onOpenFriend={onOpenFriend}
        onOpenFriends={onOpenFriends}
      />,
    ),
  );
}

it('summarises strength and cardio sessions, dates and reactions', () => {
  expect(friendSession(strength)).toEqual({
    cardio: false,
    title: 'Leg day · 1h 11min',
    detail: '2 sets',
  });
  expect(friendSession(cardio)).toEqual({
    cardio: true,
    title: 'Incline walk · 35min',
    detail: '2.8 km',
  });
  expect(friendSession({ ...cardio, name: 'Rowing cardio' }).title).toBe('Rowing · 35min');
  expect(friendSession({ ...strength, name: 'Push cardio' }).title).toBe('Push cardio · 1h 11min');
  expect(relativeDay('2026-10-19', '2026-10-19')).toBe('Today');
  expect(relativeDay('2026-10-18', '2026-10-19')).toBe('Yesterday');
  expect(relativeDay('2026-10-17', '2026-10-19')).toBe('Sat');
  expect(relativeDay('2026-10-01', '2026-10-19')).toBe('Thu 1 Oct');
  expect(reactionSummary(jordan.reactions.counts)).toEqual({ emojis: ['❤️', '👍'], total: 3 });
  expect(nextReaction('fire', 'fire')).toBeNull();
  expect(nextReaction(null, 'love')).toBe('love');
});

it('loads three more inline, blocks duplicates, and retains expansion on refresh', async () => {
  const entries = Array.from({ length: 9 }, (_, i) => ({
    ...jordan,
    friend: { ...jordan.friend, id: `friend-${i}`, display_name: `Friend ${i}` },
    workout: { ...strength, id: `workout-${i}` },
  }));
  const feed = vi
    .spyOn(api.sharing, 'feed')
    .mockResolvedValue({ items: entries.slice(0, 5), friends: 10, with_sessions: 9 });
  const openFriends = vi.fn();
  await render(vi.fn(), openFriends);
  expect(host.querySelector('h2')?.textContent).toBe('Recent Friends Activity');
  expect(feed).toHaveBeenLastCalledWith(5);
  const more = host.querySelector<HTMLButtonElement>('.friends-activity-more')!;
  expect(more.textContent).toBe('+4 more');
  let finish!: (value: { items: FriendFeedItem[]; friends: number; with_sessions: number }) => void;
  feed.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => {
    more.click();
    more.click();
  });
  expect(feed).toHaveBeenCalledTimes(2);
  expect(feed).toHaveBeenLastCalledWith(8);
  expect(more.disabled).toBe(true);
  expect(more.getAttribute('aria-busy')).toBe('true');
  expect(more.querySelector('.calendar-older-spinner')).not.toBeNull();
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(feed).toHaveBeenCalledTimes(2);
  await act(async () => finish({ items: entries.slice(0, 8), friends: 10, with_sessions: 9 }));
  expect(host.querySelectorAll('.friend-activity-list li')).toHaveLength(8);
  expect(more.textContent).toBe('+1 more');
  feed.mockResolvedValue({ items: entries.slice(0, 8), friends: 10, with_sessions: 9 });
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(feed).toHaveBeenLastCalledWith(8);
  feed.mockResolvedValue({ items: entries, friends: 10, with_sessions: 9 });
  await act(async () => more.click());
  expect(feed).toHaveBeenLastCalledWith(11);
  expect(host.querySelectorAll('.friend-activity-list li')).toHaveLength(9);
  expect(host.querySelector('.friends-activity-more')).toBeNull();
  expect(openFriends).not.toHaveBeenCalled();
});

it('keeps existing rows after a failed expansion and allows retry', async () => {
  const feed = vi
    .spyOn(api.sharing, 'feed')
    .mockResolvedValue({ items: [jordan, alex], friends: 8, with_sessions: 6 });
  await render();
  feed.mockRejectedValueOnce(new Error('offline'));
  await act(async () => host.querySelector<HTMLButtonElement>('.friends-activity-more')!.click());
  expect(host.querySelectorAll('.friend-activity-list li')).toHaveLength(2);
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Try again');
  const more = host.querySelector<HTMLButtonElement>('.friends-activity-more')!;
  expect(more.disabled).toBe(false);
  await act(async () => more.click());
  expect(host.querySelector('[role=alert]')).toBeNull();
});

it("shows each friend's latest session with one reaction button and opens their profile", async () => {
  vi.spyOn(api.sharing, 'feed').mockResolvedValue({
    items: [jordan, alex],
    friends: 2,
    with_sessions: 2,
  });
  const openFriend = vi.fn();
  await render(openFriend);

  const rows = [...host.querySelectorAll('.friend-activity-list li')];
  expect(rows.map((row) => row.textContent)).toEqual([
    'JJordan PreviewStrengthLeg day · 1h 11minToday · 2 sets❤️👍 30 comments',
    'AAlex PreviewCardioIncline walk · 35minYesterday · 2.8 km0 comments',
  ]);
  // One reaction button and one comments button per friend rather than every reaction.
  expect(host.querySelectorAll('.friend-react-button')).toHaveLength(2);
  expect(host.querySelectorAll('.discussion-comments-button')).toHaveLength(2);
  expect(host.querySelector('.friend-react-picker')).toBeNull();

  await act(async () => host.querySelector<HTMLButtonElement>('.friend-activity-open')!.click());
  expect(openFriend).toHaveBeenCalledWith(jordan.friend);
});

it('shows the original logged time in local time beside the workout day for strength and cardio', async () => {
  const savedAt = '2026-10-19T06:34:00Z';
  const localTime = new Date(savedAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  vi.spyOn(api.sharing, 'feed').mockResolvedValue({
    items: [
      {
        ...jordan,
        workout: {
          ...strength,
          created_at: savedAt,
          updated_at: '2026-10-19T09:00:00Z',
          start_time: '12:00:00',
          end_time: '13:11:00',
        },
      },
      { ...alex, workout: { ...cardio, created_at: '2026-10-19T17:34:00+11:00' } },
      {
        ...jordan,
        workout: { ...strength, id: 'legacy', created_at: '2026-10-19T06:34:00' },
      },
    ],
    friends: 3,
    with_sessions: 3,
  });
  await render();
  expect([...host.querySelectorAll('.friend-activity-meta')].map((row) => row.textContent)).toEqual(
    [
      `Today · ${localTime} · 2 sets`,
      `Yesterday · ${localTime} · 2.8 km`,
      `Today · ${localTime} · 2 sets`,
    ],
  );
});

it('omits unavailable logged times without displaying an invalid time', async () => {
  vi.spyOn(api.sharing, 'feed').mockResolvedValue({
    items: [{ ...jordan, workout: { ...strength, created_at: 'invalid' } }, alex],
    friends: 2,
    with_sessions: 2,
  });
  await render();
  expect([...host.querySelectorAll('.friend-activity-meta')].map((row) => row.textContent)).toEqual(
    ['Today · 2 sets', 'Yesterday · 2.8 km'],
  );
});

it('opens comments without the reaction picker, and reactions without the comments', async () => {
  vi.spyOn(api.sharing, 'feed').mockResolvedValue({ items: [alex], friends: 1, with_sessions: 1 });
  const comments = vi
    .spyOn(api.sharing, 'comments')
    .mockResolvedValue({ items: [], total: 0, next_offset: null });
  await render();

  const commentsButton = button('0 comments on Alex Preview’s Incline walk');
  await act(async () => commentsButton.click());
  expect(commentsButton.getAttribute('aria-expanded')).toBe('true');
  expect(comments).toHaveBeenCalledWith('w2');
  expect(host.querySelector('.workout-discussion-thread')?.hasAttribute('hidden')).toBe(false);
  expect(host.querySelector('.friend-react-picker')).toBeNull();
  expect(host.querySelector('.comment-composer select')).toBeNull();

  const reactButton = button('React to Alex Preview’s Incline walk');
  await act(async () => reactButton.click());
  expect(reactButton.getAttribute('aria-expanded')).toBe('true');
  expect(commentsButton.getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector('.friend-react-picker')).not.toBeNull();
  expect(host.querySelector('.workout-discussion-thread')?.hasAttribute('hidden')).toBe(true);
});

it('reacts from the picker, shows your reaction, and removes it when chosen again', async () => {
  const feed = vi
    .spyOn(api.sharing, 'feed')
    .mockResolvedValue({ items: [alex], friends: 1, with_sessions: 1 });
  const react = vi
    .spyOn(api.sharing, 'react')
    .mockResolvedValue({ counts: [{ reaction: 'love', count: 1 }], yours: 'love' });
  const remove = vi
    .spyOn(api.sharing, 'removeReaction')
    .mockResolvedValue({ counts: [], yours: null });
  await render();

  const trigger = button('React to Alex Preview’s Incline walk');
  await act(async () => trigger.click());
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelectorAll('.friend-react-picker button')).toHaveLength(6);
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Like');

  feed.mockResolvedValue({
    items: [{ ...alex, reactions: { counts: [{ reaction: 'love', count: 1 }], yours: 'love' } }],
    friends: 1,
    with_sessions: 1,
  });
  await act(async () => button('Love').click());
  expect(react).toHaveBeenCalledWith('w2', 'love');
  // Choosing a reaction closes the picker without opening the comments.
  expect(host.querySelector('.friend-react-picker')).toBeNull();
  expect(host.querySelector('.workout-comments')).toBeNull();
  const mine = button('Your reaction to Alex Preview’s Incline walk: Love. Change reaction');
  expect(mine.textContent).toBe('❤️ 1');
  expect(document.activeElement).toBe(mine);

  await act(async () => mine.click());
  expect(button('Love').getAttribute('aria-pressed')).toBe('true');
  feed.mockResolvedValue({ items: [alex], friends: 1, with_sessions: 1 });
  await act(async () => button('Love').click());
  expect(remove).toHaveBeenCalledWith('w2');
  expect(button('React to Alex Preview’s Incline walk').textContent).not.toContain('❤️');
});

it('refreshes an already reacted session to the newest workout and keeps the server recency order', async () => {
  vi.useFakeTimers();
  const reacted = {
    ...alex,
    reactions: { counts: [{ reaction: 'love' as const, count: 1 }], yours: 'love' as const },
  };
  const feed = vi
    .spyOn(api.sharing, 'feed')
    .mockResolvedValue({ items: [jordan, reacted], friends: 2, with_sessions: 2 });
  await render();
  const newest = {
    ...alex,
    workout: { ...strength, id: 'w3', name: 'New upper day' },
    reactions: { counts: [], yours: null },
  };
  feed.mockResolvedValue({ items: [newest, jordan], friends: 2, with_sessions: 2 });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  const rows = [...host.querySelectorAll('.friend-activity-list li')];
  expect(rows[0].textContent).toContain('Alex PreviewStrengthNew upper day');
  expect(rows[1].textContent).toContain('Jordan Preview');
  expect(rows[0].querySelector('.friend-react-button')?.getAttribute('aria-label')).toBe(
    'React to Alex Preview’s New upper day',
  );
  expect(host.textContent).not.toContain('Incline walk');
});

it('refreshes on return to the page and ignores stale in-flight feed responses', async () => {
  let oldResponse!: (feed: {
    items: FriendFeedItem[];
    friends: number;
    with_sessions: number;
  }) => void;
  vi.spyOn(api.sharing, 'feed')
    .mockReturnValueOnce(
      new Promise((resolve) => {
        oldResponse = resolve;
      }),
    )
    .mockResolvedValue({ items: [alex, jordan], friends: 2, with_sessions: 2 });
  await render();
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(host.querySelector('.friend-activity-list li')?.textContent).toContain('Alex Preview');
  await act(async () => oldResponse({ items: [jordan], friends: 1, with_sessions: 1 }));
  expect(host.querySelectorAll('.friend-activity-list li')).toHaveLength(2);
  expect(host.querySelector('.friend-activity-list li')?.textContent).toContain('Alex Preview');
});

it('pauses background refresh while hidden or away from Home', async () => {
  vi.useFakeTimers();
  const feed = vi
    .spyOn(api.sharing, 'feed')
    .mockResolvedValue({ items: [alex], friends: 1, with_sessions: 1 });
  await render();
  let visibility: DocumentVisibilityState = 'hidden';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(feed).toHaveBeenCalledTimes(1);
  visibility = 'visible';
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(feed).toHaveBeenCalledTimes(2);
  await act(async () =>
    root.render(
      <FriendsActivityCard active={false} onOpenFriend={vi.fn()} onOpenFriends={vi.fn()} />,
    ),
  );
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(feed).toHaveBeenCalledTimes(2);
});

it('closes the picker with Escape or a tap elsewhere without reacting', async () => {
  vi.spyOn(api.sharing, 'feed').mockResolvedValue({
    items: [jordan, alex],
    friends: 2,
    with_sessions: 2,
  });
  const react = vi.spyOn(api.sharing, 'react');
  await render();

  const trigger = button('React to Jordan Preview’s Leg day');
  await act(async () => trigger.click());
  expect(host.querySelector('.friend-activity-list')?.classList).toContain('is-picking');
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(host.querySelector('.friend-react-picker')).toBeNull();
  expect(document.activeElement).toBe(trigger);

  await act(async () => trigger.click());
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(host.querySelector('.friend-react-picker')).toBeNull();
  expect(react).not.toHaveBeenCalled();
});

it('explains the card when your profile is private, you have no friends yet or friends have no sessions', async () => {
  const feed = vi
    .spyOn(api.sharing, 'feed')
    .mockRejectedValueOnce(new ApiError('Share first.', 'sharing_required', 403));
  await render();
  expect(host.textContent).toContain('Share your profile to add friends');

  for (const [friends, message] of [
    [0, 'Add friends to see'],
    [2, 'Your friends have not logged a workout yet.'],
  ] as const) {
    feed.mockResolvedValueOnce({ items: [], friends, with_sessions: 0 });
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    expect(host.textContent).toContain(message);
  }
});
