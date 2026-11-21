// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { SharedProfileScreen } from './SharedProfiles';
import { consistencyWeeks } from './consistencyWeeks';
import { clearSharedProfileCache, prefetchSharedProfile } from './sharedProfileCache';
import { addDays } from './trainingSummary';
import { GOAL_UNDO_MS } from './useGoalRemoval';
import { localDate } from './utils';
import type { SharedProfile, SharedWorkoutPage, TrackedWorkout, User } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';

const profile: SharedProfile = {
  id: 'friend',
  display_name: 'Sample Friend',
  profile_photo_url: null,
  member_since: '2026-10-01T12:00:00Z',
  visibility: 'public',
  is_you: false,
  friend_status: 'friends',
  friends_since: '2026-10-06T12:00:00Z',
  can_view: true,
  workout_count: 2,
  recent_workout_count: 2,
  last_workout_date: '2026-10-17',
  shares: null,
  body_weight: null,
  goals: null,
  cardio_sessions: null,
  consistency: {
    current_streak: 2,
    training_days: 23,
    workout_types: DEFAULT_WORKOUT_TYPES.map((type) =>
      type.id === 'push' ? { ...type, color: '#abcdef' } : type,
    ),
    heatmap: [
      {
        workout_date: '2026-10-17',
        categories: ['push'],
        workout_count: 2,
        set_count: 8,
        workouts: [],
      },
    ],
  },
  training_time: {
    workout_minutes: 213,
    workout_count: 4,
    cardio_minutes: 80,
    cardio_count: 3,
    total_minutes: 273,
  },
  training_time_past_year: {
    workout_minutes: 90,
    workout_count: 2,
    cardio_minutes: 20,
    cardio_count: 1,
    total_minutes: 100,
  },
};
const workout: TrackedWorkout = {
  id: 'first',
  name: 'First workout',
  workout_date: '2026-10-17',
  category: 'lower',
  notes: null,
  duration_minutes: null,
  start_time: null,
  end_time: null,
  is_sample: false,
  created_at: '2026-10-17T12:00:00Z',
  updated_at: '2026-10-17T12:00:00Z',
  movements: [],
};
let root: Root;
let container: HTMLDivElement;
function renderProfile(
  profileId = 'friend',
  ownProfile?: { user: User; onSaved: (user: User) => void },
  active = true,
  dataRevision: string | null = null,
  onOpenSplits?: () => void,
  targetWorkout?: Pick<TrackedWorkout, 'id' | 'workout_date'>,
) {
  return act(async () =>
    root.render(
      <SharedProfileScreen
        dataRevision={dataRevision}
        profileId={profileId}
        targetWorkout={targetWorkout}
        ownProfile={ownProfile}
        active={active}
        onOpenSplits={onOpenSplits}
        onChooseSharing={() => {}}
        renderWorkouts={({ workouts, hasMore, onLoadMore }) => (
          <>
            <ul>
              {workouts.map((item) => (
                <li key={item.id}>{item.name}</li>
              ))}
            </ul>
            {hasMore && (
              <button type="button" onClick={onLoadMore}>
                Load older
              </button>
            )}
          </>
        )}
      />,
    ),
  );
}
beforeEach(async () => {
  clearSharedProfileCache();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(api.sharing, 'profile').mockResolvedValue(profile);
  vi.spyOn(api.sharing, 'workoutFilters').mockResolvedValue({
    exercises: [{ id: 'squat', name: 'Squat' }],
    machines: [],
  });
  vi.spyOn(api.sharing, 'workouts').mockImplementation(async (_id, _offset, _limit, filters) => ({
    total: filters?.category === 'push' ? 0 : 2,
    workouts: filters?.category === 'push' ? [] : [workout],
    personal_records: [],
  }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await renderProfile();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function chooseType(value: string) {
  const select = container.querySelector<HTMLSelectElement>('select')!;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function button(prefix: string) {
  return [...container.querySelectorAll('button')].find((item) =>
    item.textContent?.startsWith(prefix),
  )!;
}

describe('shared profile friend control', () => {
  it('renders the shared maintenance band and its current status', async () => {
    vi.mocked(api.sharing.profile).mockResolvedValue({
      ...profile,
      body_weight: [
        { measurement_date: '2026-10-17', weight_kg: 84, body_fat_pct: null },
        { measurement_date: '2026-10-16', weight_kg: 84.5, body_fat_pct: null },
      ],
      goals: {
        body_weight: {
          start_date: '2026-10-01',
          target_date: '2026-12-31',
          start_weight_kg: 84,
          target_weight_kg: 84,
          maintenance_min_kg: 82,
          maintenance_max_kg: 86,
        },
        zone2: {
          week_start: '2026-10-12',
          week_end: '2026-10-18',
          goal_minutes: 150,
          completed_minutes: 0,
          remaining_minutes: 150,
          percentage: 0,
          complete: false,
        },
      },
    });
    await renderProfile('friend', undefined, true, 'range-update');
    expect(container.textContent).toContain('Maintain 82–86 kg until');
    expect(container.textContent).toContain('In range');
    expect(container.querySelector('.pulse-chart-goal-band')).not.toBeNull();
    expect(container.querySelector('[aria-label="Body-weight goal progress"]')).toBeNull();
  });
  it('opens a visible shared profile photo in the square viewer', async () => {
    vi.mocked(api.sharing.profile).mockResolvedValue({
      ...profile,
      profile_photo_url: '/api/sharing/profiles/friend/photo?v=sample',
      can_view: false,
    });
    await renderProfile('friend-with-photo');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.profile-photo-view')!.click(),
    );
    expect(document.querySelector('dialog img')?.getAttribute('src')).toBe(
      '/api/sharing/profiles/friend/photo?v=sample',
    );
    await act(async () => document.querySelector<HTMLButtonElement>('dialog button')!.click());
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('shows Friends with a menu holding the start month, Remove friend and Block', async () => {
    expect(container.textContent).not.toContain('Public');
    expect(container.querySelector('.profile-joined')?.textContent).toBe('Joined October 2026');
    const friends = button('Friends');
    expect(friends.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[role="menu"]')).toBeNull();
    await act(async () => friends.click());
    expect(friends.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[role="menu"]')?.textContent).toBe(
      'Since Oct 2026Remove friendBlock',
    );
    vi.spyOn(api.sharing, 'removeFriend').mockResolvedValue(undefined);
    vi.useFakeTimers();
    try {
      await act(async () => button('Remove friend').click());
      // The removal waits out its Undo window, showing the result at once.
      expect(api.sharing.removeFriend).not.toHaveBeenCalled();
      expect(document.querySelector('.toast')?.textContent).toContain('Removed Sample Friend');
      expect(button('Add friend')).toBeTruthy();
      await act(async () => vi.advanceTimersByTime(GOAL_UNDO_MS));
      expect(api.sharing.removeFriend).toHaveBeenCalledExactlyOnceWith('friend');
      expect(document.querySelector('.toast')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the friendship when Remove friend is undone', async () => {
    const remove = vi.spyOn(api.sharing, 'removeFriend').mockResolvedValue(undefined);
    vi.useFakeTimers();
    try {
      await act(async () => button('Friends').click());
      await act(async () => button('Remove friend').click());
      const undo = document.querySelector<HTMLButtonElement>('.toast .toast-action')!;
      await act(async () => undo.click());
      expect(document.querySelector('.toast')).toBeNull();
      expect(button('Friends')).toBeTruthy();
      await act(async () => vi.advanceTimersByTime(GOAL_UNDO_MS * 2));
      expect(remove).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks before blocking, then offers Unblock on the blocked profile', async () => {
    const block = vi.spyOn(api.sharing, 'blockMember').mockResolvedValue(undefined);
    await act(async () => button('Friends').click());
    await act(async () => button('Block').click());
    const dialog = document.querySelector('dialog[open]');
    expect(dialog?.textContent).toContain('Block Sample Friend?');
    expect(dialog?.textContent).toContain('unblock them in Social, under Friends');
    expect(block).not.toHaveBeenCalled();
    await act(async () =>
      dialog!.querySelector<HTMLButtonElement>('.popup-primary-action.is-danger')!.click(),
    );
    expect(block).toHaveBeenCalledWith('friend');
    expect(container.textContent).toContain('You blocked Sample Friend');
    expect(container.textContent).not.toContain('under Find');

    const unblock = vi.spyOn(api.sharing, 'unblockMember').mockResolvedValue(undefined);
    vi.mocked(api.sharing.profile).mockResolvedValue({
      ...profile,
      friend_status: 'none',
      friends_since: null,
    });
    await act(async () => button('Unblock').click());
    expect(unblock).toHaveBeenCalledExactlyOnceWith('friend');
    expect(container.textContent).not.toContain('You blocked Sample Friend');
    expect(button('Add friend')).toBeTruthy();
  });

  it('accepts or declines a friend request from a friends-only profile', async () => {
    vi.mocked(api.sharing.profile).mockResolvedValue({
      ...profile,
      id: 'asker',
      visibility: 'followers',
      friend_status: 'incoming',
      friends_since: null,
      can_view: false,
    });
    await renderProfile('asker');
    expect(container.textContent).toContain('Sample Friend sent you a friend request');
    expect(container.querySelector('[aria-label="More options for Sample Friend"]')).not.toBeNull();
    const accept = vi.spyOn(api.sharing, 'acceptFriend').mockResolvedValue({ status: 'friends' });
    vi.mocked(api.sharing.profile).mockResolvedValue(profile);
    await act(async () => button('Accept').click());
    expect(accept).toHaveBeenCalledWith('asker');
    expect(button('Friends')).toBeTruthy();
  });
});

describe('own profile', () => {
  const user: User = {
    id: 'owner',
    username: 'sample.owner',
    display_name: 'Sample Owner',
    is_admin: false,
    can_upload_videos: false,
    created_at: '2026-10-01T12:00:00Z',
  };

  it('preloads while hidden and keeps workouts visible during the opening refresh', async () => {
    const owner = { user, onSaved: vi.fn() };
    vi.mocked(api.sharing.profile).mockResolvedValue({ ...profile, id: user.id, is_you: true });
    await renderProfile(user.id, owner, false);
    expect(api.sharing.workouts).toHaveBeenLastCalledWith(user.id, 0, 10, expect.any(Object));
    expect(container.textContent).toContain('First workout');
    vi.mocked(api.sharing.profile).mockImplementation(() => new Promise(() => {}));
    await renderProfile(user.id, owner, true);
    expect(container.textContent).toContain('First workout');
    expect(container.textContent).not.toContain('Loading profile');
    expect(container.textContent).not.toContain('Loading workouts');
  });

  it('does not preload another member while their panel is hidden', async () => {
    vi.mocked(api.sharing.profile).mockClear();
    await renderProfile('another-member', undefined, false);
    expect(api.sharing.profile).not.toHaveBeenCalled();
  });

  it('reuses the training profile with editing and hides settings and self-friend/reaction actions', async () => {
    vi.mocked(api.sharing.profile).mockResolvedValue({
      ...profile,
      id: user.id,
      is_you: true,
      visibility: 'private',
    });
    const onSaved = vi.fn();
    await renderProfile(user.id, { user, onSaved });
    expect(container.querySelectorAll('.profile-summary')).toHaveLength(1);
    expect(container.querySelector('.profile-summary .shared-stat-row')?.textContent).toContain(
      'Last 30 days',
    );
    expect(container.querySelector('.calendar-panel')).not.toBeNull();
    expect(container.textContent).toContain('First workout');
    expect(container.querySelector('.profile-training-time')?.textContent).toContain('4h 33min');
    expect(container.textContent).not.toContain('Change password');
    expect(container.textContent).not.toContain('Profile sharing');
    expect(container.querySelector('.profile-account-id')).toBeNull();
    // Workouts on a profile carry no reaction or comment controls; those live in the feed.
    expect(container.querySelector('.discussion-comments-button')).toBeNull();
    expect(container.querySelector('.friend-react-button')).toBeNull();
    expect(container.querySelector('.profile-friend-actions')).toBeNull();
    await act(async () => button('Edit profile').click());
    expect(container.querySelector('input[autocomplete="name"]')).not.toBeNull();
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
    expect(container.querySelector('.calendar-panel')).not.toBeNull();
    await act(async () => button('Cancel').click());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('refreshes visibility when returning from Settings and keeps the chosen workout filters', async () => {
    const owner = { user, onSaved: vi.fn() };
    vi.mocked(api.sharing.profile).mockResolvedValue({ ...profile, id: user.id, is_you: true });
    await renderProfile(user.id, owner);
    await chooseType('lower');
    await renderProfile(user.id, owner, false);
    vi.mocked(api.sharing.profile)
      .mockClear()
      .mockResolvedValue({ ...profile, id: user.id, is_you: true, visibility: 'private' });
    await renderProfile(user.id, owner, true);
    expect(api.sharing.profile).toHaveBeenCalledExactlyOnceWith(user.id);
    expect(api.sharing.workouts).toHaveBeenLastCalledWith(
      user.id,
      0,
      10,
      expect.objectContaining({ category: 'lower' }),
    );
  });
});

describe('shared body measurements', () => {
  it('keeps a single consistency calendar beside them across refreshes', async () => {
    vi.mocked(api.sharing.profile).mockResolvedValue({
      ...profile,
      sex: 'female',
      body_sizes: [
        {
          measurement_date: '2026-10-17',
          neck_cm: null,
          shoulders_cm: null,
          chest_cm: null,
          waist_cm: 76,
          hips_cm: 98,
          left_arm_cm: null,
          right_arm_cm: null,
          left_thigh_cm: null,
          right_thigh_cm: null,
          left_calf_cm: null,
          right_calf_cm: null,
          wrist_cm: null,
        },
      ],
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    clearSharedProfileCache();
    await renderProfile('friend', undefined, true, 'one');
    await renderProfile('friend', undefined, true, 'two');
    await renderProfile('friend', undefined, true, 'three');
    expect(container.querySelectorAll('.calendar-panel')).toHaveLength(1);
    // Two cards sharing a React key is what multiplied the calendar on refreshes.
    expect(errors.mock.calls.flat().join(' ')).not.toContain('same key');
    const card = container.querySelector('section[aria-labelledby="shared-body-sizes-title"]')!;
    expect(card.querySelector('.body-figure')?.getAttribute('data-figure')).toBe('female');
    expect(
      container.querySelectorAll('section[aria-labelledby="shared-body-sizes-title"]'),
    ).toHaveLength(1);
  });
});

describe('opening a profile loaded in the background', () => {
  async function reopen(targetWorkout?: Pick<TrackedWorkout, 'id' | 'workout_date'>) {
    await act(async () => root.unmount());
    root = createRoot(container);
    await renderProfile('friend', undefined, true, null, undefined, targetWorkout);
  }

  it('shows an outline of the profile, not bare text, while a first visit loads', async () => {
    clearSharedProfileCache();
    vi.mocked(api.sharing.profile).mockImplementation(() => new Promise(() => {}));
    await reopen();
    const status = container.querySelector('.profile-loading-skeleton[role="status"]')!;
    expect(status.textContent).toBe('Loading profile…');
    expect(status.querySelectorAll('.skeleton-block').length).toBeGreaterThan(3);
  });

  it('shows the loaded copy at once, then replaces it with the latest from the server', async () => {
    let answer!: (value: SharedProfile) => void;
    vi.mocked(api.sharing.profile).mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    );
    await reopen();
    expect(container.querySelector('.profile-loading-skeleton')).toBeNull();
    expect(container.textContent).toContain('Sample Friend');
    expect(container.textContent).toContain('First workout');
    expect(container.textContent).not.toContain('Loading workouts');
    await act(async () => answer({ ...profile, display_name: 'Renamed Friend' }));
    expect(container.textContent).toContain('Renamed Friend');
    expect(container.textContent).toContain('First workout');
  });

  it('opens a linked workout from the cached first page, and waits when it is not there', async () => {
    vi.mocked(api.sharing.profile).mockImplementation(() => new Promise(() => {}));
    await reopen(workout);
    expect(container.textContent).toContain('First workout');
    expect(container.textContent).not.toContain('no longer available');

    await reopen({ id: 'older', workout_date: '2026-09-01' });
    expect(container.textContent).toContain('Sample Friend');
    expect(container.textContent).not.toContain('First workout');
    expect(container.textContent).toContain('Loading workouts');
  });

  it('joins a background load still under way instead of loading the profile twice', async () => {
    clearSharedProfileCache();
    vi.mocked(api.sharing.profile).mockClear();
    vi.mocked(api.sharing.workouts).mockClear();
    let answer!: (value: SharedProfile) => void;
    vi.mocked(api.sharing.profile).mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    );
    void prefetchSharedProfile(null, 'friend');
    await reopen();
    expect(container.querySelector('.profile-loading-skeleton')).not.toBeNull();
    await act(async () => answer(profile));
    expect(api.sharing.profile).toHaveBeenCalledTimes(1);
    expect(api.sharing.workouts).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('First workout');
  });

  it('forgets the copy when the friendship changes, so access is read again', async () => {
    vi.spyOn(api.sharing, 'removeFriend').mockResolvedValue();
    vi.mocked(api.sharing.profile).mockResolvedValue({
      ...profile,
      can_view: false,
      friend_status: 'none',
    });
    await act(async () => button('Friends').click());
    await act(async () => button('Remove friend').click());
    vi.mocked(api.sharing.profile).mockImplementation(() => new Promise(() => {}));
    await reopen();
    // Leaving sends the removal, and the friends-only copy is not shown again.
    expect(api.sharing.removeFriend).toHaveBeenCalledExactlyOnceWith('friend');
    expect(container.querySelector('.profile-loading-skeleton')).not.toBeNull();
    expect(container.textContent).not.toContain('First workout');
  });
});

describe('shared workouts and cardio tabs', () => {
  const cardioOnly: TrackedWorkout = {
    ...workout,
    id: 'treadmill',
    name: 'Treadmill workout',
    movements: [{ exercise: { kind: 'cardio' } }] as unknown as TrackedWorkout['movements'],
  };
  const withCardio: SharedProfile = {
    ...profile,
    cardio_sessions: [
      {
        id: 'walk',
        session_date: '2026-10-17',
        activity_type: 'Incline Treadmill Walking',
        duration_minutes: 60,
        calories_kcal: 705,
        average_heart_rate_bpm: 138,
        distance_km: 4.66,
        average_speed_kph: null,
        incline_percent: null,
        average_power_watts: null,
        average_mets: null,
        zone: null,
        qualifies_zone2: false,
        notes: null,
      },
    ],
    cardio_total: 1,
  };
  async function reopen() {
    await act(async () => root.unmount());
    root = createRoot(container);
    await renderProfile();
  }
  function tab(name: string) {
    return [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === name,
    )!;
  }
  function panel(name: string) {
    return document.getElementById(tab(name).getAttribute('aria-controls')!)!;
  }

  it('opens on All sessions and splits strength and cardio into their own tabs', async () => {
    vi.mocked(api.sharing.profile).mockResolvedValue(withCardio);
    vi.mocked(api.sharing.workouts).mockImplementation(async (_id, _offset, _limit, filters) => ({
      total: 2,
      workouts: [workout, cardioOnly].filter(
        (item) => !filters?.start_date || item.workout_date === filters.start_date,
      ),
      personal_records: [],
    }));
    await reopen();
    expect(container.querySelector('.shared-workouts-header h2')).toBeNull();
    expect([...container.querySelectorAll('[role="tab"]')].map((item) => item.textContent)).toEqual(
      ['All sessions', 'Workouts', 'Cardio'],
    );
    expect(tab('All sessions').getAttribute('aria-selected')).toBe('true');
    expect(panel('All sessions').hidden).toBe(false);
    expect(panel('Cardio').hidden).toBe(true);
    expect(panel('All sessions').textContent).toContain('First workout');
    expect(panel('All sessions').textContent).toContain('Treadmill workout');
    expect(container.querySelector('.shared-workout-filter-toggle')).not.toBeNull();

    await act(async () => tab('Workouts').click());
    expect(tab('Workouts').getAttribute('aria-selected')).toBe('true');
    expect(panel('Workouts').hidden).toBe(false);
    expect(panel('Workouts').getAttribute('aria-labelledby')).toBe(tab('Workouts').id);
    expect(panel('Workouts').textContent).toContain('First workout');
    expect(panel('Workouts').textContent).not.toContain('Treadmill workout');

    await act(async () => tab('Cardio').click());
    expect(tab('Cardio').getAttribute('aria-selected')).toBe('true');
    expect(panel('Cardio').hidden).toBe(false);
    expect(panel('All sessions').hidden).toBe(true);
    expect(panel('Cardio').textContent).toContain('Incline Treadmill Walking');
    expect(container.querySelector('.shared-workout-filter-toggle')).toBeNull();

    // Choosing a calendar day returns to the full list, showing every workout that day.
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.calendar-panel .calendar-day.trained')!.click(),
    );
    expect(tab('All sessions').getAttribute('aria-selected')).toBe('true');
    expect(panel('All sessions').textContent).toContain('First workout');
    expect(panel('All sessions').textContent).toContain('Treadmill workout');
  });

  it('keeps reading past pages holding only cardio-only workouts', async () => {
    vi.mocked(api.sharing.profile).mockResolvedValue(withCardio);
    const older = { ...workout, id: 'older', name: 'Older lift' };
    const all = [cardioOnly, { ...cardioOnly, id: 'treadmill-2' }, older];
    vi.mocked(api.sharing.workouts).mockImplementation(async (_id, offset, limit) => ({
      total: all.length,
      workouts: all.slice(offset, offset + Math.min(limit, 1)),
      personal_records: [],
    }));
    await reopen();
    await act(async () => tab('Workouts').click());
    expect(panel('Workouts').textContent).toContain('Older lift');
    expect(panel('Workouts').textContent).not.toContain('Treadmill workout');
    expect(panel('Workouts').textContent).not.toContain('No workouts logged yet.');
    expect(api.sharing.workouts).toHaveBeenLastCalledWith('friend', 2, 10, expect.anything());
  });
});

describe('shared history filtering', () => {
  it('reports a removed linked workout, but not after selecting a different filter', async () => {
    await act(async () => root.unmount());
    root = createRoot(container);
    const missing = { id: 'removed', workout_date: workout.workout_date };
    vi.mocked(api.sharing.workouts).mockResolvedValue({
      workouts: [],
      personal_records: [],
      total: 0,
    });
    await renderProfile('friend', undefined, true, null, undefined, missing);
    expect(container.querySelector('.shared-workouts [role="alert"]')?.textContent).toContain(
      'This workout is no longer available.',
    );
    await act(async () =>
      container.querySelector<HTMLElement>('.shared-workout-filter-toggle')!.click(),
    );
    await chooseType('push');
    expect(container.textContent).not.toContain('This workout is no longer available.');
    expect(container.textContent).toContain('No workouts match these filters.');
  });

  it('opens the filters from an icon beside the Workouts title and counts those set', async () => {
    const header = container.querySelector('.shared-workouts-header')!;
    expect(header.textContent).toBe('Workouts');
    const toggle = header.querySelector<HTMLButtonElement>('.shared-workout-filter-toggle')!;
    const panel = container.querySelector<HTMLElement>('.shared-workout-filters')!;
    expect(toggle.getAttribute('aria-label')).toBe('Filter workouts');
    expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.hidden).toBe(true);
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    await chooseType('lower');
    expect(toggle.getAttribute('aria-label')).toBe('Filter workouts, 1 set');
    expect(toggle.textContent).toBe('1');
    await act(async () => toggle.click());
    expect(panel.hidden).toBe(true);
  });

  it('offers a retry when older workouts fail to load', async () => {
    vi.mocked(api.sharing.workouts).mockRejectedValueOnce(new Error('Offline'));
    await act(async () => button('Load older').click());
    expect(container.querySelector('.shared-workouts [role="alert"]')?.textContent).toContain(
      'Retry loading older workouts',
    );
    vi.mocked(api.sharing.workouts).mockResolvedValueOnce({
      total: 2,
      workouts: [{ ...workout, id: 'older', name: 'Older workout' }],
      personal_records: [],
    });
    await act(async () => button('Retry loading older workouts').click());
    expect(container.textContent).toContain('Older workout');
    expect(container.textContent).not.toContain('Retry loading older workouts');
  });

  it('preserves friends-only access for a linked workout', async () => {
    await act(async () => root.unmount());
    root = createRoot(container);
    vi.mocked(api.sharing.profile).mockResolvedValue({
      ...profile,
      can_view: false,
      friend_status: 'none',
    });
    vi.mocked(api.sharing.workouts).mockClear();
    await renderProfile('friend', undefined, true, null, undefined, workout);
    expect(api.sharing.workouts).not.toHaveBeenCalled();
    expect(container.querySelector('.history-card')).toBeNull();
    expect(container.textContent).toContain('as a friend to see their training');
  });

  it('links My splits beside the own consistency range instead of listing saved plans on the profile', async () => {
    const user: User = {
      id: 'owner',
      username: 'sample.owner',
      display_name: 'Sample Owner',
      is_admin: false,
      can_upload_videos: false,
      created_at: '2026-10-01T12:00:00Z',
    };
    vi.mocked(api.sharing.profile).mockResolvedValue({ ...profile, id: user.id, is_you: true });
    const open = vi.fn();
    await renderProfile(user.id, { user, onSaved: vi.fn() }, true, null, open);
    expect(container.querySelector('.routine-panel')).toBeNull();
    const header = container.querySelector('.calendar-panel .pulse-card-header')!;
    expect(header.textContent).toContain('Last 12 weeks');
    const link = header.querySelector<HTMLButtonElement>('button')!;
    expect(link.textContent).toContain('My splits');
    await act(async () => link.click());
    expect(open).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain('Save current split');
    vi.mocked(api.sharing.profile).mockResolvedValue(profile);
    await renderProfile('friend', undefined, true, null, open);
    expect(container.querySelector('.routine-panel')).not.toBeNull();
    expect(container.querySelector('.calendar-panel .pulse-card-header button')).toBeNull();
  });
  it('requests matching server results and resets to the first unfiltered page', async () => {
    await chooseType('push');
    expect(api.sharing.workouts).toHaveBeenLastCalledWith(
      'friend',
      0,
      10,
      expect.objectContaining({ category: 'push' }),
    );
    expect(container.textContent).toContain('No workouts match these filters.');
    await act(async () => button('Reset filters').click());
    expect(api.sharing.workouts).toHaveBeenLastCalledWith(
      'friend',
      0,
      10,
      expect.objectContaining({ category: '' }),
    );
    expect(container.textContent).toContain('First workout');
  });

  it('retains applied filters when loading another page', async () => {
    await chooseType('lower');
    vi.mocked(api.sharing.workouts).mockResolvedValueOnce({
      total: 2,
      workouts: [{ ...workout, id: 'older', name: 'Older workout' }],
      personal_records: [],
    });
    await act(async () => button('Load older').click());
    expect(api.sharing.workouts).toHaveBeenLastCalledWith(
      'friend',
      1,
      10,
      expect.objectContaining({ category: 'lower' }),
    );
    expect(container.textContent).toContain('Older workout');
  });

  it('ignores an older page response after the filter changes', async () => {
    let finish!: (page: SharedWorkoutPage) => void;
    vi.mocked(api.sharing.workouts).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => button('Load older').click());
    await chooseType('push');
    await act(async () =>
      finish({
        total: 2,
        workouts: [{ ...workout, id: 'late', name: 'Late old result' }],
        personal_records: [],
      }),
    );
    expect(container.textContent).toContain('No workouts match these filters.');
    expect(container.textContent).not.toContain('Late old result');
  });
});

it('keeps the counting explanation in a help popup next to Time trained', async () => {
  const card = container.querySelector('.profile-training-time')!;
  expect(card.textContent).not.toContain('Totals use each');
  const help = card.querySelector<HTMLButtonElement>('[aria-label="About time trained"]')!;
  // PopupDialog returns focus to the control it opened from, as a browser focuses it.
  help.focus();
  await act(async () => help.click());
  const dialog = document.querySelector('dialog[open]')!;
  expect(dialog.textContent).toContain(
    "Totals use each workout's logged duration and every cardio session. Cardio done during a workout counts once in Combined.",
  );
  await act(async () =>
    dialog.querySelector<HTMLButtonElement>('[aria-label="Close Time trained"]')!.click(),
  );
  expect(document.querySelector('dialog[open]')).toBeNull();
  expect(document.activeElement).toBe(help);
  expect(card.textContent).toContain('4h 33min');
});

it('switches Time trained between all time, selected by default, and the past year', async () => {
  const card = container.querySelector('.profile-training-time')!;
  const range = (label: string) =>
    [...card.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
      (item) => item.textContent === label,
    )!;
  expect(card.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe(
    'Time trained range',
  );
  expect(range('All time').getAttribute('aria-checked')).toBe('true');
  expect(card.textContent).toContain('4h 33min');
  await act(async () => range('Past year').click());
  expect(range('Past year').getAttribute('aria-checked')).toBe('true');
  expect(card.textContent).toContain('1h 30min');
  expect(card.textContent).toContain('1h 40min');
  expect(card.textContent).toContain('1 session');
  expect(card.textContent).not.toContain('4h 33min');
  await act(async () => range('All time').click());
  expect(card.textContent).toContain('4h 33min');
});

it('hides the Time trained range when the server sends only lifetime totals', async () => {
  vi.mocked(api.sharing.profile).mockResolvedValue({
    ...profile,
    training_time_past_year: undefined,
  });
  await act(async () => root.unmount());
  root = createRoot(container);
  await renderProfile();
  const card = container.querySelector('.profile-training-time')!;
  expect(card.querySelector('[role="radiogroup"]')).toBeNull();
  expect(card.textContent).toContain('4h 33min');
});

it('shows lifetime time separately from history filters, with no reaction controls', async () => {
  expect(container.querySelector('.profile-training-time')?.textContent).toContain('3h 33min');
  expect(container.querySelector('.profile-training-time')?.textContent).toContain('1h 20min');
  expect(container.querySelector('.profile-training-time')?.textContent).toContain('4h 33min');
  expect(container.querySelector('.friend-react-button')).toBeNull();
  await chooseType('push');
  expect(container.querySelector('.profile-training-time')?.textContent).toContain('4h 33min');
  expect(container.querySelector('.workout-discussion')).toBeNull();
});

it('shows the viewed account calendar, toggles its legend and selects a day without truncating stats', async () => {
  const card = container.querySelector('.calendar-panel')!;
  expect(card.textContent).toContain('Consistency');
  expect(card.querySelector('.consistency-stats')?.textContent).toContain('2 days');
  expect(card.querySelector('.consistency-stats')?.textContent).toContain('23');
  // Averaged over the weeks since the member's first workout, up to twelve.
  expect(card.querySelector('.consistency-stats')?.textContent).toContain(
    (23 / consistencyWeeks('2026-10-17', localDate())).toFixed(1),
  );
  const legend = card.querySelector<HTMLButtonElement>('.category-legend button')!;
  expect(legend.textContent).toContain('Push');
  expect(legend.querySelector('i')?.style.background).toBe('rgb(171, 205, 239)');
  await act(async () => legend.click());
  expect(legend.getAttribute('aria-pressed')).toBe('false');
  expect(card.querySelector('.calendar-day.trained')?.className).toContain('filtered-out');
  await act(async () => legend.click());
  expect(legend.getAttribute('aria-pressed')).toBe('true');
  expect(
    card.querySelectorAll('.calendar-day:not(.trained):not(.empty):not(:disabled)'),
  ).toHaveLength(0);
  await act(async () => card.querySelector<HTMLButtonElement>('.calendar-day.trained')!.click());
  expect(api.sharing.workouts).toHaveBeenLastCalledWith(
    'friend',
    0,
    10,
    expect.objectContaining({ start_date: '2026-10-17', end_date: '2026-10-17' }),
  );
  expect(card.querySelector('.consistency-stats')?.textContent).toContain('23');
  await chooseType('push');
  expect(card.querySelectorAll('.calendar-day.trained')).toHaveLength(1);
  expect(card.querySelector('.consistency-stats')?.textContent).toContain('23');
});

it('refreshes a changed training revision while retaining the selected workout filter', async () => {
  await chooseType('lower');
  vi.mocked(api.sharing.workouts).mockResolvedValue({
    total: 1,
    workouts: [{ ...workout, name: 'Updated on another device' }],
    personal_records: [],
  });
  await renderProfile('friend', undefined, true, 'remote-change');
  expect(container.textContent).toContain('Updated on another device');
  expect(container.querySelector<HTMLSelectElement>('select')?.value).toBe('lower');
  expect(api.sharing.workouts).toHaveBeenLastCalledWith(
    'friend',
    0,
    10,
    expect.objectContaining({ category: 'lower' }),
  );
});

it('averages a new member’s training days over the weeks since they started', async () => {
  const today = localDate();
  vi.mocked(api.sharing.profile).mockResolvedValue({
    ...profile,
    consistency: {
      ...profile.consistency!,
      training_days: 4,
      heatmap: [6, 4, 2, 1].map((back) => ({
        workout_date: addDays(today, -back),
        categories: ['push'],
        workout_count: 1,
        set_count: 3,
        workouts: [],
      })),
    },
  });
  await renderProfile('new-member');
  const stats = container.querySelector('.consistency-stats')!;
  expect(stats.textContent).toContain('Training days4');
  expect(stats.textContent).toContain('Avg / week4.0');
});

it('outlines the member’s planned and missed split days on their calendar', async () => {
  const today = localDate();
  vi.mocked(api.sharing.profile).mockResolvedValue({
    ...profile,
    consistency: {
      ...profile.consistency!,
      training_split: {
        name: 'Push / Rest',
        enabled: true,
        start_date: today,
        progression: 'calendar',
        steps: [{ workout_type_id: 'push' }, { workout_type_id: null }],
        missed_days: [{ workout_date: addDays(today, -1), workout_type_id: 'push' }],
      },
    },
  });
  await renderProfile('split-member');
  const day = (date: string) =>
    container.querySelector<HTMLButtonElement>(`.calendar-panel [data-date="${date}"]`);
  // Today's planned push and yesterday's missed one take its colour; the rest day stays plain.
  for (const date of [today, addDays(today, -1)]) {
    expect(day(date)?.className).toContain('scheduled');
    expect(day(date)?.style.getPropertyValue('--day-ring')).toBe('#abcdef');
  }
  expect(day(addDays(today, -1))?.getAttribute('aria-label')).toContain('Push missed');
  expect(day(addDays(today, 1))?.className ?? '').not.toContain('scheduled');
  // A day the split plans is still not one to open: the member logged nothing there.
  expect(day(today)?.disabled).toBe(true);
});

it('leaves the calendar unplanned when the member has no split on', async () => {
  await renderProfile('no-split-member');
  expect(container.querySelector('.calendar-panel .calendar-day.scheduled')).toBeNull();
});
