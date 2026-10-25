// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { lastWeek } from './friendFeedData';
import { SocialScreen } from './SocialScreen';
import type { FriendActivity, FriendConnections, TrackedWorkout } from './types';
import { localDate } from './utils';

let root: Root;
let host: HTMLDivElement;
const openProfile = vi.fn();
const openOwnProfile = vi.fn();
const chooseSharing = vi.fn();
const person = {
  id: 'jamie',
  display_name: 'Jamie Sample',
  profile_photo_url: null,
  since: '2026-10-21T10:00:00Z',
};
const workout: TrackedWorkout = {
  id: 'w1',
  name: 'Upper body',
  workout_date: localDate(),
  category: 'upper',
  notes: null,
  duration_minutes: 48,
  start_time: null,
  end_time: null,
  is_sample: false,
  created_at: '2026-10-21T10:00:00Z',
  updated_at: '2026-10-21T10:00:00Z',
  movements: [],
};
const week = lastWeek(localDate());
const alex: FriendActivity = {
  id: 'alex',
  display_name: 'Alex Sample',
  profile_photo_url: null,
  since: '2026-10-01T10:00:00Z',
  latest: { workout, reactions: { counts: [], yours: null } },
  recent_workout_count: 4,
  training_dates: [week[2], week[6]],
};
const casey: FriendActivity = {
  ...alex,
  id: 'casey',
  display_name: 'Casey Sample',
  latest: null,
  recent_workout_count: 0,
  training_dates: [],
};
let connections: FriendConnections;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  openProfile.mockClear();
  openOwnProfile.mockClear();
  chooseSharing.mockClear();
  connections = { friends: [alex, casey], requests: [person], sent: [], blocked: [] };
  vi.spyOn(api.sharing, 'friends').mockImplementation(async () => connections);
  vi.spyOn(api.sharing, 'notifications').mockResolvedValue({
    requests: [],
    accepted: [],
    reactions: [],
  });
  vi.spyOn(api.sharing, 'profiles').mockResolvedValue([]);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(active = true) {
  await act(async () =>
    root.render(
      <SocialScreen
        active={active}
        onOpenProfile={openProfile}
        onOpenOwnProfile={openOwnProfile}
        onChooseSharing={chooseSharing}
        onOpenSettings={vi.fn()}
      />,
    ),
  );
}

function tab(name: 'Friends' | 'Find') {
  return [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((item) =>
    item.textContent?.startsWith(name),
  )!;
}

async function click(target: HTMLElement) {
  await act(async () => target.click());
}

function labelled(label: string) {
  return host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
}

it('opens your own profile from the avatar separately from sharing settings', async () => {
  await render();
  await click(host.querySelector<HTMLButtonElement>('.account-header-actions .profile-button')!);
  expect(openOwnProfile).toHaveBeenCalledOnce();
  expect(chooseSharing).not.toHaveBeenCalled();
});

it('lists each friend once with their week and latest session, and opens their profile', async () => {
  await render();
  expect(tab('Friends').getAttribute('aria-selected')).toBe('true');
  const cards = [...host.querySelectorAll('.friend-cards > li')];
  expect(cards.map((card) => card.querySelector('b')?.textContent)).toEqual([
    'Alex Sample',
    'Casey Sample',
  ]);
  expect(cards[0].textContent).toContain('4 workouts in the last 30 days');
  expect(cards[0].textContent).toContain('Upper body · 48min');
  expect(cards[0].textContent).toContain('Today · 0 sets');
  expect(cards[0].querySelector('.friend-week')?.getAttribute('aria-label')).toBe(
    'Trained on 2 of the last 7 days',
  );
  expect(cards[0].querySelectorAll('.friend-week .is-trained')).toHaveLength(2);
  const days = [...cards[0].querySelectorAll<HTMLElement>('.friend-week > span')];
  expect(days.map((day) => day.textContent)).toEqual(
    week.map((day) =>
      new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' }),
    ),
  );
  expect(days.at(-1)?.className).toBe('is-trained is-today');
  expect(cards[0].querySelector('[aria-label="React to Alex Sample’s Upper body"]')).not.toBeNull();
  expect(cards[1].textContent).toContain('No sessions logged yet.');
  await click(labelled("Open Alex Sample's profile"));
  expect(openProfile).toHaveBeenCalledWith(alex);
});

it('shows friend requests on Find with a count, and keeps the search between tabs', async () => {
  await render();
  expect(tab('Find').getAttribute('aria-label')).toBe('Find, 1 friend request');
  expect(tab('Find').querySelector('.segmented-badge')?.textContent).toBe('1');
  await click(tab('Find'));
  expect(host.textContent).toContain('Friend requests');
  expect(host.textContent).toContain('Search people');
  const accept = vi.spyOn(api.sharing, 'acceptFriend').mockImplementation(async () => {
    connections = { ...connections, requests: [] };
    return { status: 'friends' };
  });
  await click(labelled('Accept Jamie Sample'));
  expect(accept).toHaveBeenCalledWith('jamie');
  expect(host.textContent).not.toContain('Friend requests');
  expect(tab('Find').querySelector('.segmented-badge')).toBeNull();
  const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Jamie');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(tab('Friends'));
  await click(tab('Find'));
  expect(host.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('Jamie');
});

it('cancels sent requests and unblocks members from Find', async () => {
  connections = {
    friends: [],
    requests: [],
    sent: [{ ...person, id: 'riley', display_name: 'Riley Sample' }],
    blocked: [{ ...person, id: 'morgan', display_name: 'Morgan Sample' }],
  };
  const remove = vi.spyOn(api.sharing, 'removeFriend').mockResolvedValue(undefined);
  const unblock = vi.spyOn(api.sharing, 'unblockMember').mockResolvedValue(undefined);
  await render();
  expect(host.textContent).toContain('Add friends to see their latest sessions');
  await click(
    [...host.querySelectorAll<HTMLButtonElement>('.friends-list-empty button')].find((button) =>
      button.textContent?.includes('Find friends'),
    )!,
  );
  expect(tab('Find').getAttribute('aria-selected')).toBe('true');
  await click(labelled('Cancel request to Riley Sample'));
  expect(remove).toHaveBeenCalledWith('riley');
  await click(labelled('Unblock Morgan Sample'));
  expect(unblock).toHaveBeenCalledWith('morgan');
  expect(api.sharing.friends).toHaveBeenCalledTimes(3);
});

it('keeps private profiles private, routes sharing choices to Settings and still unblocks', async () => {
  connections = {
    locked: true,
    friends: [],
    requests: [],
    sent: [],
    blocked: [{ ...person, id: 'morgan', display_name: 'Morgan Sample' }],
  };
  const unblock = vi.spyOn(api.sharing, 'unblockMember').mockResolvedValue(undefined);
  const updateSharing = vi.spyOn(api.sharing, 'updateChoices');
  await render();
  await click(
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Choose who can see your profile',
    )!,
  );
  expect(chooseSharing).toHaveBeenCalledOnce();
  await click(tab('Find'));
  expect(host.textContent).toContain('Share your profile to see others');
  await click(labelled('Unblock Morgan Sample'));
  expect(unblock).toHaveBeenCalledWith('morgan');
  expect(updateSharing).not.toHaveBeenCalled();
});

it('treats an older server’s sharing error as a locked profile', async () => {
  vi.mocked(api.sharing.friends).mockRejectedValue(
    new ApiError('Choose sharing first.', 'sharing_required', 403),
  );
  await render();
  expect(host.textContent).toContain('Share your profile to see others');
});

it('does not load or poll friends while Social is hidden', async () => {
  await render(false);
  expect(api.sharing.friends).not.toHaveBeenCalled();
  await render(true);
  expect(api.sharing.friends).toHaveBeenCalledOnce();
  await render(false);
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(api.sharing.friends).toHaveBeenCalledOnce();
});
