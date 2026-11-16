// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { SocialFeed } from './SocialFeed';
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
  const stats = [...friendCard.querySelectorAll('.feed-stats > div')].map((entry) =>
    entry.textContent?.trim(),
  );
  expect(stats).toEqual(['Time52min', 'Sets12', 'Volume5,760 kg', 'Records2 PRs']);
  const collage = friendCard.querySelector('.workout-photos-feed')!;
  expect(collage.getAttribute('data-count')).toBe('2');
  expect(collage.querySelectorAll('img')).toHaveLength(2);
  expect(collage.querySelector('img')?.getAttribute('srcset')).toBe(
    '/thumb/p1 360w, /full/p1 1200w',
  );
  // Three exercises are listed; the rest are counted.
  expect(
    [...friendCard.querySelectorAll('.feed-exercises > li')].map((entry) => entry.textContent),
  ).toEqual(['Bench press3 sets', 'Row3 sets', 'Curl2 sets', '+2 more exercises']);
  // Tapping the count lists them all, and tapping again folds them away.
  const rows = () =>
    [...friendCard.querySelectorAll('.feed-exercises > li')].map((entry) => entry.textContent);
  const more = button(friendCard, '+2 more exercises')!;
  expect(more.getAttribute('aria-expanded')).toBe('false');
  await click(more);
  expect(rows()).toEqual([
    'Bench press3 sets',
    'Row3 sets',
    'Curl2 sets',
    'Fly2 sets',
    'Dip2 sets',
    'Show fewer',
  ]);
  expect(button(friendCard, 'Show fewer')?.getAttribute('aria-expanded')).toBe('true');
  await click(button(friendCard, 'Show fewer'));
  expect(rows()).toHaveLength(4);
  expect(button(friendCard, 'React to Alex Sample’s Upper body')).toBeDefined();
  expect(button(own, 'React to Your Leg day')).toBeUndefined();

  await click(button(friendCard, 'Open Alex Sample’s Upper body workout'));
  expect(openProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 'alex' }), theirs);
  await click(button(friendCard, 'Open Alex Sample’s profile'));
  expect(openProfile).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'alex' }));
  await click(button(own, 'Open your profile'));
  expect(openOwnProfile).toHaveBeenCalledOnce();
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

it('lists friends training now above the feed', async () => {
  vi.spyOn(api.sharing, 'timeline').mockResolvedValue({ items: [], has_more: false });
  await render([
    {
      ...friend,
      presence: {
        online: true,
        last_active_at: null,
        workout: {
          name: 'Push',
          kind: 'strength',
          started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
        },
      } as FriendActivity['presence'],
    },
  ]);
  const live = host.querySelector('.feed-live')!;
  expect(live.getAttribute('aria-label')).toBe('Training now');
  expect(live.textContent).toContain('Alex Sample');
  expect(live.textContent).toContain('Push · 20 min');
  await click(button(live, 'Open Alex Sample’s profile, training now'));
  expect(openProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 'alex' }));
});

it('suggests finding friends when there is nobody to follow yet', async () => {
  vi.spyOn(api.sharing, 'timeline').mockResolvedValue({ items: [], has_more: false });
  await render([]);
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
