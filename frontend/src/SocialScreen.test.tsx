// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { lastWeek } from './friendFeedData';
import { publishFriendPresence } from './presence';
import { cachedSharedProfile, clearSharedProfileCache } from './sharedProfileCache';
import { SocialScreen } from './SocialScreen';
import type { FriendActivity, FriendConnections, SharedProfile, TrackedWorkout } from './types';
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
  vi.spyOn(api.sharing, 'timeline').mockResolvedValue({ items: [], has_more: false });
  clearSharedProfileCache();
  vi.spyOn(api.sharing, 'profile').mockImplementation(
    async (id) => ({ id, display_name: id, can_view: true }) as SharedProfile,
  );
  vi.spyOn(api.sharing, 'workouts').mockResolvedValue({
    total: 1,
    workouts: [workout],
    personal_records: [],
  });
  vi.spyOn(api.sharing, 'workoutFilters').mockResolvedValue({ exercises: [], machines: [] });
  vi.spyOn(api.sharing, 'suggestions').mockResolvedValue({
    profiles: [],
    total: 0,
    page: 1,
    page_size: 8,
  });
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

/** Social opens on its feed; these tests start from the Friends tab unless told otherwise. */
async function render(active = true, section: 'Feed' | 'Friends' = 'Friends') {
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
  if (section === 'Friends') await act(async () => tab('Friends').click());
}

function tab(name: 'Feed' | 'Friends') {
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

it('counts friends above the title', async () => {
  await render();
  expect(host.querySelector('.page-eyebrow')?.textContent).toBe('2 friends');
  expect(host.textContent).not.toContain('reactions');
});

it('opens your own profile from the avatar separately from sharing settings', async () => {
  await render();
  await click(host.querySelector<HTMLButtonElement>('.account-header-actions .profile-button')!);
  expect(openOwnProfile).toHaveBeenCalledOnce();
  expect(chooseSharing).not.toHaveBeenCalled();
});

it('has only Feed and Friends tabs', async () => {
  await render();
  expect([...host.querySelectorAll('[role="tab"]')].map((item) => item.textContent)).toEqual([
    'Feed',
    'Friends1',
  ]);
});

it('shows a loading status on Friends until the initial friends response arrives', async () => {
  let resolve!: (value: FriendConnections) => void;
  vi.mocked(api.sharing.friends).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await render();
  const skeleton = host.querySelector('.find-loading-skeleton');
  expect(skeleton?.getAttribute('role')).toBe('status');
  expect(skeleton?.textContent).toBe('Loading your friends…');
  expect(skeleton?.querySelectorAll('.find-skeleton-row')).toHaveLength(3);

  await act(async () => resolve(connections));
  expect(host.querySelector('.find-loading-skeleton')).toBeNull();
  expect(host.textContent).toContain('Alex Sample');
});

it('reads friends and the feed once in the background before Social is opened', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    await act(async () =>
      root.render(
        <SocialScreen
          active={false}
          preload
          onOpenProfile={openProfile}
          onOpenOwnProfile={openOwnProfile}
          onChooseSharing={chooseSharing}
          onOpenSettings={vi.fn()}
        />,
      ),
    );
    expect(api.sharing.friends).toHaveBeenCalledOnce();
    expect(api.sharing.timeline).toHaveBeenCalledOnce();
    expect(api.sharing.notifications).not.toHaveBeenCalled();
    expect(host.querySelector('.page-eyebrow')?.textContent).toBe('2 friends');

    // Hidden, it neither polls nor refreshes on focus.
    await act(async () => {
      vi.advanceTimersByTime(120_000);
      window.dispatchEvent(new Event('focus'));
    });
    expect(api.sharing.friends).toHaveBeenCalledOnce();
    expect(api.sharing.timeline).toHaveBeenCalledOnce();

    // Opening it shows the loaded friends straight away and refreshes them.
    await render(true);
    expect(host.querySelector('.find-loading-skeleton')).toBeNull();
    expect(host.textContent).toContain('Alex Sample');
    expect(api.sharing.friends).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it('does not read Social in the background without preload', async () => {
  await render(false, 'Feed');
  expect(api.sharing.friends).not.toHaveBeenCalled();
  expect(api.sharing.timeline).not.toHaveBeenCalled();
});

it('keeps the existing friends visible during a slow background refresh', async () => {
  await render();
  let resolve!: (value: FriendConnections) => void;
  vi.mocked(api.sharing.friends).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await act(async () => window.dispatchEvent(new Event('focus')));

  expect(api.sharing.friends).toHaveBeenCalledTimes(2);
  expect(host.querySelector('.friends-loading-skeleton')).toBeNull();
  expect(host.textContent).toContain('Alex Sample');
  await act(async () => resolve({ ...connections, friends: [casey] }));
  expect(host.textContent).not.toContain('Alex Sample');
  expect(host.textContent).toContain('Casey Sample');
});

it('lists your friends on Friends, and opens their profile', async () => {
  await render();
  expect(tab('Friends').getAttribute('aria-selected')).toBe('true');
  const group = [...host.querySelectorAll('.friend-group')].find(
    (item) => item.querySelector('h3')?.textContent === 'Friends2',
  )!;
  const rows = [...group.querySelectorAll('li')];
  expect(rows.map((row) => row.querySelector('strong')?.textContent)).toEqual([
    'Alex Sample',
    'Casey Sample',
  ]);
  expect(rows[0].textContent).toContain('4 workouts in the last 30 days');
  expect(rows[1].textContent).toContain('0 workouts in the last 30 days');
  expect(host.querySelector('[aria-label^="React to"]')).toBeNull();
  await click(labelled("Open Alex Sample's profile"));
  expect(openProfile).toHaveBeenCalledWith(alex);
});

it('loads the first five profiles in the background, only while the feed is on screen', async () => {
  vi.useFakeTimers();
  const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({
    ...alex,
    id,
    display_name: `Friend ${id}`,
  }));
  connections = { friends: many, requests: [], sent: [], blocked: [] };
  await render(true, 'Feed');
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  const loaded = () => vi.mocked(api.sharing.profile).mock.calls.map(([id]) => id);
  expect(loaded()).toEqual(['a', 'b', 'c', 'd', 'e']);
  expect(cachedSharedProfile(null, 'a')?.page.workouts).toEqual([workout]);

  // The 30-second friends refresh does not load them again.
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(loaded()).toHaveLength(5);

  // Pointing at a friend further along the row loads theirs.
  await act(async () => {
    host
      .querySelector(`[aria-label^="Open Friend f's profile"]`)!
      .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(loaded()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  vi.useRealTimers();
});

it('does not load profiles in the background from Friends or a hidden Social tab', async () => {
  vi.useFakeTimers();
  await render(false, 'Feed');
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(api.sharing.profile).not.toHaveBeenCalled();
  await render();
  vi.mocked(api.sharing.profile).mockClear();
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(api.sharing.profile).not.toHaveBeenCalled();
  vi.useRealTimers();
});

it('shows friend requests on Friends with a count, and keeps the search between tabs', async () => {
  await render(true, 'Feed');
  expect(tab('Friends').getAttribute('aria-label')).toBe('Friends, 1 friend request');
  expect(tab('Friends').querySelector('.segmented-badge')?.textContent).toBe('1');
  await click(tab('Friends'));
  expect(host.textContent).toContain('Friend requests');
  expect(host.textContent).toContain('Search people');
  const accept = vi.spyOn(api.sharing, 'acceptFriend').mockImplementation(async () => {
    connections = { ...connections, requests: [] };
    return { status: 'friends' };
  });
  await click(labelled('Accept Jamie Sample'));
  expect(accept).toHaveBeenCalledWith('jamie');
  expect(host.textContent).not.toContain('Friend requests');
  expect(tab('Friends').querySelector('.segmented-badge')).toBeNull();
  const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Jamie');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(tab('Feed'));
  await click(tab('Friends'));
  expect(host.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('Jamie');
});

it('cancels sent requests and unblocks members from Friends', async () => {
  connections = {
    friends: [],
    requests: [],
    sent: [{ ...person, id: 'riley', display_name: 'Riley Sample' }],
    blocked: [{ ...person, id: 'morgan', display_name: 'Morgan Sample' }],
  };
  const remove = vi.spyOn(api.sharing, 'removeFriend').mockResolvedValue(undefined);
  const unblock = vi.spyOn(api.sharing, 'unblockMember').mockResolvedValue(undefined);
  await render(true, 'Feed');
  expect(host.textContent).toContain('Add friends to see their workouts and photos here.');
  await click(
    [...host.querySelectorAll<HTMLButtonElement>('.feed-empty button')].find((button) =>
      button.textContent?.includes('Find friends'),
    )!,
  );
  expect(tab('Friends').getAttribute('aria-selected')).toBe('true');
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

it('shows friends’ live activity, working out first, and updates it when it changes', async () => {
  const started = new Date(Date.now() - 38 * 60_000).toISOString();
  const morgan: FriendActivity = {
    ...alex,
    id: 'morgan',
    display_name: 'Morgan Sample',
    training_dates: [week[2]],
    presence: {
      online: false,
      last_active_at: null,
      workout: { name: 'Push day', kind: 'strength', started_at: started },
    },
  };
  const away: FriendActivity = {
    ...alex,
    presence: {
      online: false,
      last_active_at: new Date(Date.now() - 125 * 60_000).toISOString(),
      workout: null,
    },
  };
  const online: FriendActivity = {
    ...casey,
    presence: { online: true, last_active_at: null, workout: null },
  };
  connections = { ...connections, friends: [away, online, morgan] };
  await render(true, 'Feed');
  const rail = () =>
    [...host.querySelectorAll('.friends-rail-person')].map(
      (person) => person.querySelector('.friends-rail-name')?.textContent,
    );
  expect(rail()).toEqual(['Morgan', 'Casey', 'Alex']);
  const [working, active] = [...host.querySelectorAll('.friends-rail-person')];
  expect(working.className).toBe('friends-rail-person is-live');
  expect(working.getAttribute('aria-label')).toBe(
    "Open Morgan Sample's profile, training now: Push day, 38 min, trained on 1 of the last 7 days",
  );
  expect(active.querySelector('.presence-dot.online')).not.toBeNull();

  await click(tab('Friends'));
  const rows = () =>
    [...host.querySelectorAll('.friend-group li')]
      .filter((row) => !row.textContent?.includes('Jamie'))
      .map((row) => row.querySelector('.shared-connection-copy')?.textContent);
  expect(rows()).toEqual([
    'Morgan SampleWorking out',
    'Casey SampleActive now',
    'Alex SampleActive 2h ago',
  ]);

  // Morgan finishes and moves behind Casey, who was online first.
  await act(async () =>
    publishFriendPresence('morgan', { online: true, last_active_at: null, workout: null }),
  );
  expect(rows()).toEqual([
    'Casey SampleActive now',
    'Morgan SampleActive now',
    'Alex SampleActive 2h ago',
  ]);
  await click(tab('Feed'));
  expect(rail()).toEqual(['Casey', 'Morgan', 'Alex']);
  expect(host.querySelector('.friends-rail-live')).toBeNull();
});
