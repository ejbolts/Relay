// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { SocialFeed } from './SocialFeed';
import { requestWorkoutFocus } from './workoutFocus';
import type {
  FriendActivity,
  Timeline,
  TimelineItem,
  TrackedMovement,
  TrackedWorkout,
  WorkoutPhoto,
} from './types';

const TODAY = '2026-11-15';
let root: Root;
let host: HTMLDivElement;
const openProfile = vi.fn();
const openOwnProfile = vi.fn();
const openFind = vi.fn();
const chooseSharing = vi.fn();

function photo(id: string, width = 1200, height = 900): WorkoutPhoto {
  return {
    id,
    thumbnail_url: `/thumb/${id}`,
    full_url: `/full/${id}`,
    width,
    height,
    created_at: '2026-11-15T10:00:00Z',
  };
}

function movement(id: string, name: string, sets: number): TrackedMovement {
  return {
    id,
    order_index: 0,
    notes: null,
    exercise: { id: `${id}-exercise`, name, kind: 'strength' } as TrackedMovement['exercise'],
    sets: Array.from({ length: sets }, (_, index) => ({
      id: `${id}-set-${index}`,
      order_index: index,
      reps: 8,
      weight_kg: 60,
      completed: true,
      set_type: 'normal',
    })) as TrackedMovement['sets'],
    machine_photos: [],
    superset_group_id: null,
    superset_name: null,
  };
}

function workout(id: string, fields: Partial<TrackedWorkout> = {}): TrackedWorkout {
  return {
    id,
    name: 'Upper body',
    workout_date: TODAY,
    category: 'upper',
    notes: null,
    duration_minutes: 52,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: '2026-11-15T10:00:00Z',
    updated_at: '2026-11-15T10:00:00Z',
    movements: [movement(`${id}-m1`, 'Bench press', 3)],
    photos: [],
    ...fields,
  };
}

function item(
  workoutValue: TrackedWorkout,
  member: Partial<TimelineItem['member']> = {},
  extra: Partial<TimelineItem> = {},
): TimelineItem {
  return {
    member: {
      id: 'alex',
      display_name: 'Alex Sample',
      profile_photo_url: null,
      is_you: false,
      ...member,
    },
    workout: workoutValue,
    reactions: { counts: [], yours: null, comment_count: 0 },
    record_count: 0,
    ...extra,
  };
}

const friend: FriendActivity = {
  id: 'alex',
  display_name: 'Alex Sample',
  profile_photo_url: null,
  since: '2026-10-01T10:00:00Z',
  latest: null,
  recent_workout_count: 3,
  training_dates: [],
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  for (const mock of [openProfile, openOwnProfile, openFind, chooseSharing]) mock.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(friends: FriendActivity[] | null = [friend], active = true) {
  await act(async () =>
    root.render(
      <SocialFeed
        active={active}
        friends={friends}
        today={TODAY}
        onOpenProfile={openProfile}
        onOpenOwnProfile={openOwnProfile}
        onOpenFind={openFind}
        onChooseSharing={chooseSharing}
      />,
    ),
  );
}

function cards() {
  return [...host.querySelectorAll<HTMLElement>('.feed-card article')];
}

function button(scope: ParentNode, label: string) {
  return [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.getAttribute('aria-label') === label || item.textContent?.trim() === label,
  );
}

async function click(target: HTMLElement | undefined) {
  expect(target).toBeDefined();
  await act(async () => target!.click());
}

it('shows each workout with its owner, summary, photos and reactions, newest first', async () => {
  const mine = workout('mine', { name: 'Leg day', photos: [] });
  const theirs = workout('theirs', {
    workout_date: '2026-11-14',
    movements: [
      movement('a', 'Bench press', 3),
      movement('b', 'Row', 3),
      movement('c', 'Curl', 2),
      movement('d', 'Fly', 2),
      movement('e', 'Dip', 2),
    ],
    photos: [photo('p1'), photo('p2')],
  });
  vi.spyOn(api.sharing, 'timeline').mockResolvedValue({
    items: [
      item(mine, { id: 'me', display_name: 'Me', is_you: true }),
      item(theirs, {}, { record_count: 2 }),
    ],
    has_more: false,
  });
  await render();

  const [own, friendCard] = cards();
  expect(own.getAttribute('aria-label')).toBe('Your Leg day');
  expect(own.querySelector('.feed-card-name b')?.textContent).toBe('You');
  expect(own.querySelector('.feed-card-name small')?.textContent).toBe('Today');
  expect(button(own, 'Add photo')).toBeDefined();

  expect(friendCard.getAttribute('aria-label')).toBe('Alex Sample’s Upper body');
  expect(friendCard.querySelector('.feed-card-name small')?.textContent).toBe('Yesterday');
  expect(button(friendCard, 'Add photo')).toBeUndefined();
  // The workout name leads; who and when sit beneath it.
  expect(friendCard.querySelector('.feed-card-heading')?.textContent).toBe(
    'Upper bodyAlex SampleYesterday',
  );
  expect(friendCard.querySelector('.friend-activity-kind')).toBeNull();
  // One summary line, each value with its own unit.
  const stats = [...friendCard.querySelectorAll('.feed-stats > li')].map((entry) =>
    entry.textContent?.trim(),
  );
  expect(stats).toEqual(['52min', '12 sets', '5,760 kg', '2 PRs']);
  const collage = friendCard.querySelector('.workout-photos-feed')!;
  expect(collage.getAttribute('data-count')).toBe('2');
  expect(collage.querySelectorAll('img')).toHaveLength(2);
  expect(collage.querySelector('img')?.getAttribute('srcset')).toBe(
    '/thumb/p1 360w, /full/p1 1200w',
  );
  // Three exercises are listed; the rest are counted.
  expect(
    [...friendCard.querySelectorAll('.feed-exercises > li')].map((entry) => entry.textContent),
  ).toEqual(['Bench press, ', 'Row, ', 'Curl ', '+2 more']);
  // Tapping the count lists them all, and tapping again folds them away.
  const rows = () =>
    [...friendCard.querySelectorAll('.feed-exercises > li')].map((entry) => entry.textContent);
  const more = button(friendCard, 'Show 2 more exercises')!;
  expect(more.getAttribute('aria-expanded')).toBe('false');
  await click(more);
  expect(rows()).toEqual(['Bench press, ', 'Row, ', 'Curl, ', 'Fly, ', 'Dip ', 'Show fewer']);
  expect(button(friendCard, 'Show fewer exercises')?.getAttribute('aria-expanded')).toBe('true');
  await click(button(friendCard, 'Show fewer exercises'));
  expect(rows()).toHaveLength(4);
  // Your one-exercise workout still names its exercise, as it differs from the workout's name.
  expect(own.querySelector('.feed-exercises')?.textContent).toBe('Bench press');
  expect(button(friendCard, 'React to Alex Sample’s Upper body')).toBeDefined();
  expect(button(own, 'React to Your Leg day')).toBeUndefined();

  await click(button(friendCard, 'Open Alex Sample’s Upper body workout'));
  expect(openProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 'alex' }), theirs);
  await click(button(friendCard, 'Open Alex Sample’s profile'));
  expect(openProfile).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'alex' }));
  await click(button(own, 'Open your profile'));
  expect(openOwnProfile).toHaveBeenCalledOnce();
});

it('shows one reaction total in the card header, and no exercise line that repeats the name', async () => {
  const mine = workout('mine', { name: 'Bench press' });
  const theirs = workout('theirs', { workout_date: '2026-11-14' });
  vi.spyOn(api.sharing, 'timeline').mockResolvedValue({
    items: [
      item(
        mine,
        { id: 'me', display_name: 'Me', is_you: true },
        {
          reactions: {
            counts: [
              { reaction: 'strong', count: 2 },
              { reaction: 'fire', count: 1 },
            ],
            yours: null,
            comment_count: 0,
          },
        },
      ),
      item(
        theirs,
        {},
        {
          reactions: { counts: [{ reaction: 'fire', count: 2 }], yours: 'fire', comment_count: 3 },
        },
      ),
    ],
    has_more: false,
  });
  await render();

  const [own, friendCard] = cards();
  // Your own workout: the emojis people chose and one total, which opens who reacted.
  const total = button(own, 'View 3 reactions on Your Bench press')!;
  expect(total.textContent).toBe('💪🔥 3');
  expect(own.querySelectorAll('.discussion-reaction-summary')).toHaveLength(1);
  expect(button(own, '0 comments on Your Bench press')?.textContent).toBe('');
  // The workout is one exercise with the same name, so it is not repeated underneath.
  expect(own.querySelector('.feed-exercises')).toBeNull();

  // A friend's workout: your reaction and the total side by side, then the comment count.
  const yours = friendCard.querySelector('.discussion-reaction-summary.is-yours')!;
  expect(yours.textContent).toBe('🔥 2');
  expect(button(friendCard, 'View 2 reactions on Alex Sample’s Upper body')).toBeDefined();
  expect(button(friendCard, '3 comments on Alex Sample’s Upper body')?.textContent).toBe('3');
});

it('adds a photo to your own workout and confirms it in a popup', async () => {
  vi.spyOn(api.sharing, 'timeline').mockResolvedValue({
    items: [item(workout('mine'), { id: 'me', display_name: 'Me', is_you: true })],
    has_more: false,
  });
  const upload = vi.spyOn(api, 'uploadWorkoutPhoto').mockResolvedValue(photo('new', 900, 1200));
  await render();

  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(input.getAttribute('aria-label')).toBe('Add a photo to Your Upper body');
  const file = new File(['image'], 'gym.jpg', { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));

  expect(upload).toHaveBeenCalledWith('mine', file);
  const collage = host.querySelector<HTMLElement>('.workout-photos-feed')!;
  expect(collage.getAttribute('data-count')).toBe('1');
  expect(collage.style.getPropertyValue('--photo-ratio')).toBe('900 / 1200');
  expect(document.body.querySelector('.undo-toast')?.textContent).toContain('Photo added');
});

it('opens a photo full screen, steps between photos and removes your own', async () => {
  vi.spyOn(api.sharing, 'timeline').mockResolvedValue({
    items: [
      item(workout('mine', { photos: [photo('p1'), photo('p2')] }), {
        id: 'me',
        display_name: 'Me',
        is_you: true,
      }),
    ],
    has_more: false,
  });
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  const remove = vi.spyOn(api, 'deleteWorkoutPhoto').mockResolvedValue(undefined);
  await render();

  await click(button(host, 'View photo 1 of 2 of Your Upper body'));
  const viewer = () => document.body.querySelector<HTMLDialogElement>('.workout-photo-viewer');
  expect(viewer()?.querySelector('h2')?.textContent).toBe('Photo 1 of 2');
  expect(viewer()?.querySelector('img')?.getAttribute('src')).toBe('/full/p1');
  expect(button(viewer()!, 'Previous photo')?.disabled).toBe(true);
  await click(button(viewer()!, 'Next photo'));
  expect(viewer()?.querySelector('h2')?.textContent).toBe('Photo 2 of 2');

  await click(button(viewer()!, 'Remove'));
  await click(button(viewer()!, 'Confirm remove'));
  expect(remove).toHaveBeenCalledWith('p2');
  expect(viewer()).toBeNull();
  expect(host.querySelector('.workout-photos-feed')?.getAttribute('data-count')).toBe('1');
  expect(document.body.querySelector('.undo-toast')?.textContent).toContain('Photo removed');
});

it('stops offering Add photo once your workout has three photos', async () => {
  vi.spyOn(api.sharing, 'timeline').mockResolvedValue({
    items: [
      item(workout('mine', { photos: [photo('p1'), photo('p2'), photo('p3')] }), {
        id: 'me',
        display_name: 'Me',
        is_you: true,
      }),
    ],
    has_more: false,
  });
  await render();
  const collage = host.querySelector('.workout-photos-feed')!;
  expect(collage.getAttribute('data-count')).toBe('3');
  expect(collage.querySelectorAll('img')).toHaveLength(3);
  expect(button(host, 'Add photo')).toBeUndefined();
});

it('shows only a friend’s photos, without a way to remove them', async () => {
  vi.spyOn(api.sharing, 'timeline').mockResolvedValue({
    items: [item(workout('theirs', { photos: [photo('p1')] }))],
    has_more: false,
  });
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  await render();
  await click(button(host, 'View photo 1 of 1 of Alex Sample’s Upper body'));
  const viewer = document.body.querySelector('.workout-photo-viewer')!;
  expect(viewer.querySelector('h2')?.textContent).toBe('Workout photo');
  expect(button(viewer, 'Remove')).toBeUndefined();
  expect(button(viewer, 'Next photo')).toBeUndefined();
});

it('loads older workouts on request and skips any it already shows', async () => {
  const pages: Timeline[] = [
    { items: [item(workout('w1')), item(workout('w2'))], has_more: true },
    { items: [item(workout('w2')), item(workout('w3'))], has_more: false },
  ];
  const timeline = vi
    .spyOn(api.sharing, 'timeline')
    .mockResolvedValueOnce(pages[0])
    .mockResolvedValueOnce(pages[1]);
  await render();
  expect(cards()).toHaveLength(2);
  expect(timeline).toHaveBeenCalledWith(0, 10);

  await click(button(host, 'Show older workouts'));
  expect(timeline).toHaveBeenLastCalledWith(2, 10);
  expect(cards()).toHaveLength(3);
  expect(button(host, 'Show older workouts')).toBeUndefined();
});

it('shows each friend above the feed, training now first, with their week', async () => {
  vi.spyOn(api.sharing, 'timeline').mockResolvedValue({ items: [], has_more: false });
  vi.spyOn(api.sharing, 'profile').mockRejectedValue(new Error('offline'));
  const morgan: FriendActivity = {
    ...friend,
    id: 'morgan',
    display_name: 'Morgan Sample',
    training_dates: ['2026-11-13', TODAY],
    presence: {
      online: true,
      last_active_at: null,
      workout: {
        name: 'Push',
        kind: 'strength',
        started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
      },
    } as FriendActivity['presence'],
  };
  await render([friend, morgan]);
  const rail = host.querySelector('.friends-rail')!;
  expect(rail.getAttribute('aria-label')).toBe('Friends');
  const people = [...rail.querySelectorAll<HTMLButtonElement>('.friends-rail-person')];
  expect(people.map((person) => person.querySelector('.friends-rail-name')?.textContent)).toEqual([
    'Morgan',
    'Alex',
  ]);
  expect(people[0].getAttribute('aria-label')).toBe(
    "Open Morgan Sample's profile, training now: Push, 20 min, trained on 2 of the last 7 days",
  );
  expect(people[0].querySelector('.friends-rail-live')?.textContent).toBe('Live');
  expect(people[0].querySelectorAll('.friends-rail-week > span')).toHaveLength(7);
  expect(people[0].querySelectorAll('.friends-rail-week .is-trained')).toHaveLength(2);
  expect(people[0].querySelector('.friends-rail-week > span:last-child')?.className).toBe(
    'is-trained is-today',
  );
  expect(people[1].getAttribute('aria-label')).toBe(
    "Open Alex Sample's profile, trained on 0 of the last 7 days",
  );
  expect(people[1].querySelector('.friends-rail-live')).toBeNull();
  await click(people[0]);
  expect(openProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 'morgan' }));
});

it('suggests finding friends when there is nobody to follow yet', async () => {
  vi.spyOn(api.sharing, 'timeline').mockResolvedValue({ items: [], has_more: false });
  await render([]);
  expect(host.querySelector('.friends-rail')).toBeNull();
  expect(host.textContent).toContain('Add friends to see their workouts and photos here.');
  await click(button(host, 'Find friends'));
  expect(openFind).toHaveBeenCalledOnce();
});

it('asks a private account to share first, and offers a retry when loading fails', async () => {
  vi.spyOn(api.sharing, 'timeline').mockRejectedValueOnce(
    new ApiError('Share your profile', 'sharing_required', 403),
  );
  await render();
  await click(button(host, 'Choose who can see your profile'));
  expect(chooseSharing).toHaveBeenCalledOnce();

  await act(async () => root.unmount());
  root = createRoot(host);
  const timeline = vi
    .spyOn(api.sharing, 'timeline')
    .mockRejectedValueOnce(new ApiError('Server error', 'server_error', 500))
    .mockResolvedValueOnce({ items: [item(workout('w1'))], has_more: false });
  timeline.mockClear();
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    'The server had a problem. Try again in a moment.',
  );
  await click(button(host, 'Try again'));
  expect(timeline).toHaveBeenCalledTimes(2);
  expect(cards()).toHaveLength(1);
});

it('does not load the feed while it is hidden', async () => {
  const timeline = vi.spyOn(api.sharing, 'timeline');
  await render([friend], false);
  expect(timeline).not.toHaveBeenCalled();
  expect(host.querySelector('[aria-label="Loading the feed"]')).not.toBeNull();
});

describe('opening a workout from a notification', () => {
  const sam = { id: 'sam', display_name: 'Sam Sample', profile_photo_url: null };
  const scrolled: Element[] = [];

  beforeEach(() => {
    scrolled.length = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(callback, 0),
    );
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
    vi.spyOn(api.sharing, 'reactionPeople').mockResolvedValue({
      items: [
        { ...friend, id: 'alex', reaction: 'fire' },
        { ...sam, reaction: 'strong' },
      ],
      total: 2,
      next_offset: null,
    });
  });

  const own = (id: string) =>
    item(
      workout(id, { name: `Session ${id}` }),
      { id: 'me', display_name: 'Me', is_you: true },
      {
        reactions: { counts: [{ reaction: 'strong', count: 2 }], yours: null, comment_count: 1 },
      },
    );

  async function settle() {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }

  it('scrolls to the card, outlines it and opens its reactions with the person highlighted', async () => {
    vi.spyOn(api.sharing, 'timeline').mockResolvedValue({
      items: [own('w1'), own('w2')],
      has_more: false,
    });
    await render();
    await act(async () =>
      requestWorkoutFocus({
        workoutId: 'w2',
        workoutName: 'Session w2',
        panel: 'people',
        personId: 'sam',
      }),
    );
    await settle();

    const card = host.querySelectorAll('.feed-card')[1];
    expect(card.classList.contains('is-focused')).toBe(true);
    expect(scrolled).toContain(card);
    expect(api.sharing.reactionPeople).toHaveBeenCalledWith('w2');
    const highlighted = document.querySelector('.reaction-people-list li.is-highlighted');
    expect(highlighted?.textContent).toContain('Sam Sample');
    expect(document.querySelectorAll('.reaction-people-list li.is-highlighted')).toHaveLength(1);
  });

  it('loads older pages until the workout appears', async () => {
    const timeline = vi
      .spyOn(api.sharing, 'timeline')
      .mockResolvedValueOnce({ items: [own('w1')], has_more: true })
      .mockResolvedValueOnce({ items: [own('w2')], has_more: true })
      .mockResolvedValueOnce({ items: [own('w3')], has_more: false });
    await render();
    await act(async () =>
      requestWorkoutFocus({
        workoutId: 'w3',
        workoutName: 'Session w3',
        panel: 'people',
        personId: 'sam',
      }),
    );
    await settle();

    expect(timeline).toHaveBeenCalledTimes(3);
    expect(host.querySelectorAll('.feed-card')[2].classList.contains('is-focused')).toBe(true);
    expect(document.querySelector('.reaction-people-list li.is-highlighted')).not.toBeNull();
  });

  it('opens the reactions over the feed when the workout is not in it', async () => {
    vi.spyOn(api.sharing, 'timeline').mockResolvedValue({ items: [own('w1')], has_more: false });
    await render();
    await act(async () =>
      requestWorkoutFocus({
        workoutId: 'gone',
        workoutName: 'Old session',
        panel: 'people',
        personId: 'sam',
      }),
    );
    await settle();

    expect(host.querySelector('.feed-card.is-focused')).toBeNull();
    expect(api.sharing.reactionPeople).toHaveBeenCalledWith('gone');
    expect(
      document.querySelector('.reaction-people-list li.is-highlighted')?.textContent,
    ).toContain('Sam Sample');
  });

  it('opens the comment thread with the comment highlighted', async () => {
    vi.spyOn(api.sharing, 'timeline').mockResolvedValue({ items: [own('w1')], has_more: false });
    const comment = {
      id: 'c9',
      author: sam,
      body: 'Solid session!',
      parent_id: null,
      reply_to: null,
      created_at: '2026-11-15T11:00:00Z',
      edited_at: null,
      can_edit: false,
      can_delete: false,
      reactions: { counts: [], yours: null },
    };
    vi.spyOn(api.sharing, 'comments').mockResolvedValue({
      items: [{ ...comment, id: 'c8', body: 'Earlier' }, comment],
      next_offset: null,
      total: 2,
    });
    await render();
    await act(async () =>
      requestWorkoutFocus({
        workoutId: 'w1',
        workoutName: 'Session w1',
        panel: 'comments',
        commentId: 'c9',
      }),
    );
    await settle();

    const highlighted = host.querySelectorAll('.workout-comment.is-highlighted');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].textContent).toContain('Solid session!');
    expect(scrolled).toContain(highlighted[0]);
  });
});
