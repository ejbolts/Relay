// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import metadata from '../release.json';
import { App } from './App';
import { api } from './api';
import { announcedVersion } from './releaseMetadata';
import { UserContext, type UserSession } from './userContext';
import { readDashboardCache, writeDashboardCache } from './workoutCache';
import type { DashboardData, User } from './types';

// A silent patch keeps announcing the release whose notes it ships.
const announced = announcedVersion(metadata);

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    api: {
      ...original.api,
      workoutRevision: vi.fn().mockResolvedValue({ revision: 'initial' }),
      dashboard: vi.fn(),
      listExercises: vi.fn(),
      listWorkouts: vi.fn(),
      listBodyMeasurements: vi.fn(),
      listPersonalRecords: vi.fn(),
      getWorkoutTypeColors: vi.fn().mockResolvedValue({}),
      getAppNotices: vi.fn(),
      saveAppNotices: vi.fn(),
    },
    revisionAfterSave: vi.fn(() => null),
  };
});
vi.mock('./workoutCache', () => ({
  readDashboardCache: vi.fn().mockResolvedValue(null),
  writeDashboardCache: vi.fn().mockResolvedValue(undefined),
  readWorkoutCache: vi.fn().mockResolvedValue(null),
  writeWorkoutCache: vi.fn().mockResolvedValue(undefined),
}));

const lifter: User = {
  id: 'user-1',
  username: 'lifter',
  display_name: 'Lifter',
  is_admin: false,
  can_upload_videos: false,
  created_at: '2020-01-01T10:00:00Z',
};
let root: Root;
let container: HTMLDivElement;

async function mount(user: User = lifter) {
  const session: UserSession = {
    user,
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
  // Let the account's notices and the first data load settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}
const whatsNew = () => document.querySelector<HTMLDialogElement>('dialog.release-announcement');
const homeGuide = () => document.querySelector('.home-guide');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.workoutRevision).mockResolvedValue({ revision: 'initial' });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  window.localStorage.clear();
  window.localStorage.setItem('gym-logger-reduce-motion', 'reduced');
  // The Home Screen guide is waiting its turn, as it is for an account new to this device.
  window.localStorage.setItem('gym-logger-home-screen-guide:user-1', 'waiting');
  window.history.replaceState(null, '', '#dashboard');
  vi.mocked(api.dashboard).mockResolvedValue({ recommendation: null } as unknown as DashboardData);
  vi.mocked(api.listExercises).mockResolvedValue([]);
  vi.mocked(api.listWorkouts).mockResolvedValue([]);
  vi.mocked(api.listBodyMeasurements).mockResolvedValue([]);
  vi.mocked(api.listPersonalRecords).mockResolvedValue([]);
  vi.mocked(api.getAppNotices).mockResolvedValue({ release_seen: null, weekly_review_seen: null });
  vi.mocked(api.saveAppNotices).mockResolvedValue({ release_seen: null, weekly_review_seen: null });
  vi.mocked(readDashboardCache).mockResolvedValue(null);
  vi.mocked(writeDashboardCache).mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('opens one prompt per visit: What’s new first, the Home Screen guide on a later visit', async () => {
  await mount();
  expect(whatsNew()?.open).toBe(true);
  expect(homeGuide()).toBeNull();

  await act(async () =>
    whatsNew()!.querySelector<HTMLButtonElement>('.popup-dialog-close')!.click(),
  );
  expect(whatsNew()).toBeNull();
  // Nothing follows it this visit, and the dismissal is recorded for the account.
  expect(homeGuide()).toBeNull();
  expect(api.saveAppNotices).toHaveBeenCalledWith({ release_seen: announced });

  // The next visit: What's new is done, so the guide takes its turn.
  await act(async () => root.unmount());
  root = createRoot(container);
  await mount();
  expect(whatsNew()).toBeNull();
  expect(homeGuide()).not.toBeNull();
});

it('skips What’s new when the account dismissed it on another device', async () => {
  vi.mocked(api.getAppNotices).mockResolvedValue({
    release_seen: announced,
    weekly_review_seen: null,
  });
  await mount();
  expect(whatsNew()).toBeNull();
  expect(homeGuide()).not.toBeNull();
});

it('skips What’s new for an account created after the release', async () => {
  await mount({ ...lifter, created_at: `${metadata.date}T12:00:00Z` });
  expect(whatsNew()).toBeNull();
});
