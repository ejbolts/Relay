// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { api, type SavedStartupData } from './api';
import { localDate } from './utils';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';
import {
  readDashboardCache,
  readWorkoutCache,
  writeDashboardCache,
  writeWorkoutCache,
} from './workoutCache';
import type { DashboardData, Exercise, PersonalRecord, TrackedWorkout, User } from './types';
import { UserContext, type UserSession } from './userContext';

vi.mock('./workoutCache', () => ({
  readDashboardCache: vi.fn().mockResolvedValue(null),
  writeDashboardCache: vi.fn().mockResolvedValue(undefined),
  readWorkoutCache: vi.fn().mockResolvedValue(null),
  writeWorkoutCache: vi.fn().mockResolvedValue(undefined),
}));

const account: User = {
  id: 'member-1',
  username: 'member',
  display_name: 'Sample Member',
  is_admin: false,
  can_upload_videos: false,
  created_at: '2026-10-29T10:00:00Z',
};
const exercise = (name: string): Exercise => ({
  id: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  category: 'push',
  kind: 'strength',
  muscle_group: 'Pectorals',
  equipment: 'Machine',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
  muscle_set_credits: [{ muscle_name: 'Pectorals', sets: 1 }],
});
const dashboard = { recommendation: null, heatmap: [] } as unknown as DashboardData;

/** A read the test answers by hand, to hold the server back. */
function held<T>() {
  let answer!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (answer = resolve));
  return { promise, answer };
}

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
  vi.spyOn(api.trainingBlocks, 'get').mockResolvedValue({ blocks: [] });
  vi.spyOn(api, 'workoutRevision').mockResolvedValue({ revision: 'asked' });
  vi.spyOn(api, 'dashboard').mockResolvedValue(dashboard);
  vi.spyOn(api, 'listExercises').mockResolvedValue([exercise('Server press')]);
  vi.spyOn(api, 'listWorkouts').mockResolvedValue([]);
  vi.spyOn(api, 'listBodyMeasurements').mockResolvedValue([]);
  vi.spyOn(api, 'listPersonalRecords').mockResolvedValue([]);
  vi.spyOn(api, 'savedStartupData').mockResolvedValue(null);
  vi.spyOn(api, 'rememberStartupData').mockResolvedValue(undefined);
  vi.spyOn(api, 'exerciseLibrary').mockResolvedValue([]);
  vi.spyOn(api, 'createExercise').mockImplementation(async (input) => ({
    ...exercise('Custom press'),
    ...input,
    id: 'custom',
    is_custom: true,
  }));
  vi.spyOn(api, 'getWorkoutTypes').mockResolvedValue(DEFAULT_WORKOUT_TYPES);
  vi.spyOn(api, 'getTrainingPreferences').mockResolvedValue({
    preferred_weight_unit: 'kg',
    week_start: 'monday',
    zone2_goal_minutes: 150,
    weekly_muscle_set_goal: 10,
  });
  vi.spyOn(api.sharing, 'profile').mockRejectedValue(new Error('not needed'));
  vi.spyOn(api.sharing, 'workouts').mockResolvedValue({
    workouts: [],
    personal_records: [],
    total: 0,
  });
  vi.spyOn(api.sharing, 'workoutFilters').mockResolvedValue({ exercises: [], machines: [] });
  vi.spyOn(api.sharing, 'friends').mockResolvedValue({
    friends: [],
    requests: [],
    sent: [],
    blocked: [],
    locked: false,
  });
  vi.spyOn(api.sharing, 'timeline').mockResolvedValue({ items: [], has_more: false });
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

/** The account as the session check returns it, with the revision the server reported. */
async function signedIn(revision: string | null): Promise<User> {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(account), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...(revision ? { 'X-Workout-Revision': revision } : {}),
          },
        }),
    ),
  );
  const user = await api.auth.me();
  // Reads the tests leave unmocked fail quietly instead of answering with the account.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 404 })),
  );
  return user;
}

async function open(user: User, section = 'dashboard') {
  window.history.replaceState(null, '', `#${section}`);
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
}

const saved = (
  name: string,
  dashboardDate: string | null = localDate(),
  revision = 'rev-1',
): SavedStartupData => ({
  exercises: [exercise(name)],
  workouts: [] as TrackedWorkout[],
  personalRecords: [] as PersonalRecord[],
  measurements: [],
  revision,
  dashboardDate,
});

async function click(element: Element) {
  await act(async () => (element as HTMLElement).click());
}

async function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLInputElement ? 'input' : 'change', { bubbles: true }),
    );
  });
}

/** Chooses an option from the tab bar's Start menu. */
async function chooseStart(label: string) {
  await click(host.querySelector('.app-tab-start')!);
  await click(
    [...host.querySelectorAll('.start-menu-option')].find((option) =>
      option.textContent?.includes(label),
    )!,
  );
}

const waitingNotice = () => host.querySelector('.background-activity-bar')?.textContent ?? '';

it('starts every opening read at once when the session check reported the revision', async () => {
  const exercises = held<Exercise[]>();
  vi.mocked(api.listExercises).mockReturnValue(exercises.promise);
  await open(await signedIn('rev-1'));

  expect(api.workoutRevision).not.toHaveBeenCalled();
  expect(api.dashboard).toHaveBeenCalledOnce();
  expect(api.listPersonalRecords).toHaveBeenCalledOnce();
  expect(api.listBodyMeasurements).toHaveBeenCalledOnce();
  expect(api.listWorkouts).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'rev-1');
  // The other tabs load beside Home's data rather than after it.
  expect(api.sharing.friends).toHaveBeenCalledOnce();
  expect(api.sharing.timeline).toHaveBeenCalledOnce();
  expect(api.exerciseLibrary).toHaveBeenCalledOnce();

  await act(async () => exercises.answer([exercise('Server press')]));
  // The catalogue arriving and the refresh finishing do not read the trends a second time.
  expect(api.exerciseLibrary).toHaveBeenCalledOnce();
  expect(api.rememberStartupData).toHaveBeenCalledExactlyOnceWith('rev-1', localDate());
  expect(api.workoutRevision).not.toHaveBeenCalled();
});

it('asks for the revision once when the server did not report it', async () => {
  await open(await signedIn(null));

  expect(api.workoutRevision).toHaveBeenCalledOnce();
  expect(api.savedStartupData).toHaveBeenCalledExactlyOnceWith(expect.any(String));
  // The workouts read reuses that answer instead of asking again.
  expect(api.listWorkouts).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'asked');
  expect(api.rememberStartupData).toHaveBeenCalledExactlyOnceWith('asked', localDate());
});

it('opens with the copies saved on this device while the server is still answering', async () => {
  const exercises = held<Exercise[]>();
  vi.mocked(api.listExercises).mockReturnValue(exercises.promise);
  vi.mocked(api.savedStartupData).mockResolvedValue(saved('Saved press'));
  await open(await signedIn('rev-1'), 'progress');

  expect(api.savedStartupData).toHaveBeenCalledExactlyOnceWith(expect.any(String));
  expect(host.querySelector('.today-loading-skeleton')).toBeNull();
  expect(host.textContent).toContain('Saved press');
  // The server confirmed these copies are current, so nothing says otherwise.
  expect(waitingNotice()).toBe('');

  await act(async () => exercises.answer([exercise('Server press')]));
  expect(host.textContent).toContain('Server press');
  expect(host.textContent).not.toContain('Saved press');
});

it('waits for the server when this device has no copies for the revision', async () => {
  const exercises = held<Exercise[]>();
  vi.mocked(api.listExercises).mockReturnValue(exercises.promise);
  await open(await signedIn('rev-1'), 'progress');

  expect(host.querySelector('.today-loading-skeleton')).not.toBeNull();
  await act(async () => exercises.answer([exercise('Server press')]));
  expect(host.querySelector('.today-loading-skeleton')).toBeNull();
  expect(host.textContent).toContain('Server press');
});

it('keeps the server answer when the saved copies are read after it', async () => {
  const copies = held<SavedStartupData | null>();
  vi.mocked(api.savedStartupData).mockReturnValue(copies.promise);
  await open(await signedIn('rev-1'), 'progress');
  expect(host.textContent).toContain('Server press');

  await act(async () => copies.answer(saved('Saved press')));
  expect(host.textContent).toContain('Server press');
  expect(host.textContent).not.toContain('Saved press');
});

it('loads the hidden profile once, after the opening reads have finished', async () => {
  const records = held<PersonalRecord[]>();
  vi.mocked(api.listPersonalRecords).mockReturnValue(records.promise);
  vi.mocked(api.savedStartupData).mockResolvedValue(saved('Saved press'));
  await open(await signedIn('rev-1'));

  // Home is already usable from the saved copies, but the profile still waits its turn.
  expect(host.querySelector('.today-loading-skeleton')).toBeNull();
  expect(api.sharing.profile).not.toHaveBeenCalled();
  expect(api.sharing.workouts).not.toHaveBeenCalled();

  await act(async () => records.answer([]));
  expect(api.sharing.profile).toHaveBeenCalledExactlyOnceWith(account.id);
  expect(api.sharing.workouts).toHaveBeenCalledOnce();
});

it('holds a start that follows Home until yesterday\u2019s saved figures have been replaced', async () => {
  const records = held<PersonalRecord[]>();
  vi.mocked(api.listPersonalRecords).mockReturnValue(records.promise);
  // Nothing has changed, but the saved dashboard was read for another day.
  vi.mocked(api.savedStartupData).mockResolvedValue(saved('Saved press', '2026-01-01'));
  await open(await signedIn('rev-1'));
  expect(host.querySelector('.today-loading-skeleton')).toBeNull();

  await chooseStart('Cardio');
  expect(window.location.hash).toBe('#dashboard');
  expect(waitingNotice()).toContain('Getting your latest training');

  await act(async () => records.answer([]));
  expect(window.location.hash).toBe('#log');
  expect(waitingNotice()).not.toContain('Getting your latest training');
});

it('starts straight away from saved figures the server confirmed for today', async () => {
  const records = held<PersonalRecord[]>();
  vi.mocked(api.listPersonalRecords).mockReturnValue(records.promise);
  vi.mocked(api.savedStartupData).mockResolvedValue(saved('Saved press'));
  await open(await signedIn('rev-1'));

  await chooseStart('Cardio');
  expect(window.location.hash).toBe('#log');
  expect(waitingNotice()).not.toContain('Getting your latest training');
});

it('starts an empty workout without waiting, because it does not follow Home', async () => {
  const records = held<PersonalRecord[]>();
  vi.mocked(api.listPersonalRecords).mockReturnValue(records.promise);
  vi.mocked(api.savedStartupData).mockResolvedValue(saved('Saved press', '2026-01-01'));
  await open(await signedIn('rev-1'));

  await chooseStart('Empty');
  expect(window.location.hash).toBe('#log');
});

it('keeps an exercise added here when an older read of the list answers afterwards', async () => {
  const exercises = held<Exercise[]>();
  vi.mocked(api.listExercises).mockReturnValue(exercises.promise);
  vi.mocked(api.savedStartupData).mockResolvedValue(saved('Saved press'));
  await open(await signedIn('rev-1'), 'progress');

  await click(host.querySelector('.exercise-list-toolbar [aria-label="Add exercise"]')!);
  const dialog = document.querySelector<HTMLDialogElement>('.create-exercise-dialog')!;
  await setValue(dialog.querySelector('input[placeholder="Exercise name"]')!, 'Custom press');
  await setValue(dialog.querySelector('select')!, 'push');
  await setValue(dialog.querySelector('[aria-label="Target muscle 1"]')!, 'Pectorals');
  await click(dialog.querySelector('button[type="submit"]')!);
  expect(host.querySelector('[data-exercise-id="custom"]')?.textContent).toContain('Custom press');

  // The read began before the exercise existed, so its answer does not include it.
  await act(async () => exercises.answer([exercise('Saved press')]));
  expect(host.querySelector('[data-exercise-id="custom"]')?.textContent).toContain('Custom press');
  // That refresh is not treated as complete, so the next check reads the list again.
  expect(api.rememberStartupData).not.toHaveBeenCalled();

  vi.mocked(api.listExercises).mockResolvedValue([
    exercise('Saved press'),
    { ...exercise('Custom press'), id: 'custom', is_custom: true },
  ]);
  vi.mocked(api.workoutRevision).mockResolvedValue({ revision: 'rev-1' });
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(api.listExercises).toHaveBeenCalledTimes(2);
  expect(api.rememberStartupData).toHaveBeenCalledExactlyOnceWith('rev-1', localDate());
  expect(host.querySelector('[data-exercise-id="custom"]')?.textContent).toContain('Custom press');
});

it('shows the saved copies before the revision is known, and starts nothing from them until it is', async () => {
  // Opened before the session check answered, so the app asks for the revision itself.
  const revision = held<{ revision: string }>();
  vi.mocked(api.workoutRevision).mockReturnValue(revision.promise);
  const exercises = held<Exercise[]>();
  vi.mocked(api.listExercises).mockReturnValue(exercises.promise);
  vi.mocked(api.savedStartupData).mockResolvedValue(saved('Saved press'));
  await open(await signedIn(null), 'progress');

  // Every screen has its figures at once, though nothing vouches for them yet.
  expect(host.querySelector('.today-loading-skeleton')).toBeNull();
  expect(host.textContent).toContain('Saved press');
  expect(api.dashboard).not.toHaveBeenCalled();
  expect(api.exerciseLibrary).not.toHaveBeenCalled();
  await chooseStart('Cardio');
  expect(window.location.hash).toBe('#progress');
  expect(waitingNotice()).toContain('Getting your latest training');

  // The server is at the revision the copies were read at today: they are current.
  await act(async () => revision.answer({ revision: 'rev-1' }));
  expect(window.location.hash).toBe('#log');
  expect(waitingNotice()).toBe('');
  expect(api.listWorkouts).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'rev-1');
  expect(api.exerciseLibrary).toHaveBeenCalledOnce();

  // The same exercise as the server has it now: the list did not change, so the trends stand.
  await act(async () => exercises.answer([{ ...exercise('Saved press'), name: 'Server press' }]));
  expect(api.exerciseLibrary).toHaveBeenCalledOnce();
});

it('says it is updating while saved copies that are behind the server are being replaced', async () => {
  const exercises = held<Exercise[]>();
  vi.mocked(api.listExercises).mockReturnValue(exercises.promise);
  // Something changed on another device since these copies were saved.
  vi.mocked(api.savedStartupData).mockResolvedValue(saved('Saved press', localDate(), 'older'));
  await open(await signedIn('rev-1'), 'progress');

  expect(host.querySelector('.today-loading-skeleton')).toBeNull();
  expect(host.textContent).toContain('Saved press');
  expect(waitingNotice()).toContain('Updating your training');
  // Nothing is started from figures known to be behind.
  await chooseStart('Cardio');
  expect(window.location.hash).toBe('#progress');

  await act(async () => exercises.answer([exercise('Server press')]));
  expect(host.textContent).toContain('Server press');
  expect(host.textContent).not.toContain('Saved press');
  expect(waitingNotice()).toBe('');
  expect(window.location.hash).toBe('#log');
});
