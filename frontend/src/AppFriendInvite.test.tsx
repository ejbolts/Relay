// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';
import {
  readDashboardCache,
  readWorkoutCache,
  writeDashboardCache,
  writeWorkoutCache,
} from './workoutCache';
import { pendingFriendInvite } from './friendInvite';
import type { DashboardData, SharedProfile, User } from './types';
import { UserContext, type UserSession } from './userContext';

vi.mock('./workoutCache', () => ({
  readDashboardCache: vi.fn().mockResolvedValue(null),
  writeDashboardCache: vi.fn().mockResolvedValue(undefined),
  readWorkoutCache: vi.fn().mockResolvedValue(null),
  writeWorkoutCache: vi.fn().mockResolvedValue(undefined),
}));

const account: User = {
  id: 'viewer-1',
  username: 'new_member',
  display_name: 'New Member',
  is_admin: false,
  can_upload_videos: true,
  created_at: '2026-10-29T10:00:00Z',
};
const inviterId = 'd7131000-7937-40be-b8ee-8b02800f5a36';
const inviter = {
  id: inviterId,
  display_name: 'Sam Rivera',
  profile_photo_url: null,
  member_since: '2026-01-04',
  visibility: 'followers',
  is_you: false,
  friend_status: 'none',
  can_view: false,
  workout_count: null,
  recent_workout_count: null,
  last_workout_date: null,
  shares: { notes: false, body_weight: false, goals: false, machine_photos: false },
  body_weight: null,
  goals: null,
  cardio_sessions: null,
} as unknown as SharedProfile;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.mocked(readDashboardCache).mockResolvedValue(null);
  vi.mocked(readWorkoutCache).mockResolvedValue(null);
  vi.mocked(writeDashboardCache).mockResolvedValue(undefined);
  vi.mocked(writeWorkoutCache).mockResolvedValue(undefined);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem('gym-logger-reduce-motion', 'reduced');
  vi.spyOn(api, 'workoutRevision').mockResolvedValue({ revision: 'initial' });
  vi.spyOn(api, 'dashboard').mockResolvedValue({
    recommendation: null,
    heatmap: [],
  } as unknown as DashboardData);
  vi.spyOn(api, 'listExercises').mockResolvedValue([]);
  vi.spyOn(api, 'listWorkouts').mockResolvedValue([]);
  vi.spyOn(api, 'listBodyMeasurements').mockResolvedValue([]);
  vi.spyOn(api, 'listPersonalRecords').mockResolvedValue([]);
  vi.spyOn(api, 'getWorkoutTypes').mockResolvedValue(DEFAULT_WORKOUT_TYPES);
  vi.spyOn(api, 'getTrainingPreferences').mockResolvedValue({
    preferred_weight_unit: 'kg',
    week_start: 'monday',
    zone2_goal_minutes: 150,
    weekly_muscle_set_goal: 10,
  });
  vi.spyOn(api.sharing, 'profile').mockImplementation(async (id) =>
    id === inviterId ? inviter : Promise.reject(new Error('unexpected profile')),
  );
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

async function openLink(hash: string) {
  window.history.replaceState(null, '', hash);
  const session: UserSession = {
    user: account,
    updateUser: vi.fn(),
    signOut: vi.fn(),
    accountDeleted: vi.fn(),
  };
  await act(async () =>
    root.render(
      <UserContext.Provider value={session}>
        <App />
      </UserContext.Provider>,
    ),
  );
}

it('opens the inviter’s profile with Add friend once signed in', async () => {
  // Captured before sign-in, as main.tsx does when the QR code's link opens.
  window.sessionStorage.setItem('relay.pendingFriendInvite', inviterId);
  await openLink('/');

  expect(window.location.hash).toBe('#shared-profile');
  expect(api.sharing.profile).toHaveBeenCalledWith(inviterId);
  expect(host.querySelector('.overlay-header-copy')?.textContent).toContain('Sam Rivera');
  expect(host.textContent).toContain('Add Sam Rivera as a friend to see their training');
  expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Add friend')).toBe(
    true,
  );
  // Used once: a reload or a later visit opens the app normally.
  expect(pendingFriendInvite()).toBeNull();
});

it('opens a link scanned while the app is already open', async () => {
  await openLink('/#dashboard');
  await act(async () => {
    window.history.replaceState(window.history.state, '', `/#friend=${inviterId}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  expect(window.location.hash).toBe('#shared-profile');
  expect(host.textContent).toContain('Add Sam Rivera as a friend to see their training');
});

it('opens your own profile when you scan your own code', async () => {
  window.sessionStorage.setItem('relay.pendingFriendInvite', account.id);
  vi.mocked(api.sharing.profile).mockResolvedValue({
    ...inviter,
    id: account.id,
    display_name: account.display_name,
    is_you: true,
    can_view: true,
  });
  await openLink('/');

  expect(window.location.hash).toBe('#profile');
});
