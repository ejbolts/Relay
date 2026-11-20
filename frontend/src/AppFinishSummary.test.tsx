// @vitest-environment jsdom
import { act } from 'react';
import { type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
import { readDashboardCache, writeDashboardCache } from './workoutCache';
import { writeActiveWorkoutDraft, type ActiveWorkoutDraft } from './workoutDraft';
import { createWorkoutSet } from './workoutSets';
import type {
  DashboardData,
  Exercise,
  PersonalRecord,
  TrackedWorkout,
  WorkoutInput,
} from './types';
import { createToastRoot } from './toastTestUtils';

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
      listMachinePhotos: vi.fn().mockResolvedValue([]),
      lastUsedMachinePhotos: vi.fn().mockResolvedValue([]),
      // The save never lands in these tests: the card must not wait for it.
      createWorkout: vi.fn(() => new Promise(() => undefined)),
      updateWorkout: vi.fn(),
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

const bench: Exercise = {
  id: 'bench',
  name: 'Bench press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
let root: Root;
let container: HTMLDivElement;

function liveDraft(workoutDate = '2026-11-17') {
  const startedAt = Date.now() - 30 * 60_000;
  const draft: ActiveWorkoutDraft = {
    version: 1,
    startedAt,
    updatedAt: startedAt,
    lastActiveAt: startedAt,
    inactiveFinishAt: startedAt + 3 * 60 * 60 * 1000,
    name: 'Push workout',
    workoutDate,
    category: 'push',
    notes: '',
    movements: [
      {
        key: 'movement-0',
        exerciseId: bench.id,
        notes: '',
        machinePhotoIds: [],
        supersetKey: null,
        isComplete: false,
        sets: [80, 80].map((weight, index) => ({
          ...createWorkoutSet('strength', undefined, false),
          key: `set-${index}`,
          reps: 8,
          weight_kg: weight,
          rest_seconds: 0,
          completed: true,
        })),
      },
    ],
  };
  writeActiveWorkoutDraft(draft);
}

async function mount() {
  await act(async () => root.render(<App />));
}
async function click(target: HTMLElement) {
  await act(async () => target.click());
}
const card = () => container.querySelector<HTMLElement>('.finished-workout');
async function finish() {
  await click(container.querySelector<HTMLButtonElement>('[aria-label="Finish workout"]')!);
  // With every entered set ticked, Finish saves straight away without asking.
  const confirm = document.querySelector<HTMLButtonElement>(
    '.workout-finish-actions .popup-primary-action',
  );
  if (confirm) await click(confirm);
}

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
  window.history.replaceState(null, '', '#log');
  vi.mocked(api.dashboard).mockResolvedValue({ recommendation: null } as unknown as DashboardData);
  vi.mocked(api.listExercises).mockResolvedValue([bench]);
  vi.mocked(api.listWorkouts).mockResolvedValue([]);
  vi.mocked(api.listBodyMeasurements).mockResolvedValue([]);
  vi.mocked(api.listPersonalRecords).mockResolvedValue([]);
  vi.mocked(api.getWorkoutTypeColors).mockResolvedValue({
    upper: '#8b5cf6',
    lower: '#f59e0b',
    push: '#ef476f',
    pull: '#3b82f6',
    full_body: '#14b8a6',
    cardio: '#22c55e',
    other: '#94a3b8',
  });
  vi.mocked(readDashboardCache).mockResolvedValue(null);
  vi.mocked(writeDashboardCache).mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createToastRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('shows the finished workout on Home at once, before it has synced, and keeps it across a reload', async () => {
  liveDraft();
  await mount();
  expect(card()).toBeNull();
  await finish();

  expect(window.location.hash).toBe('#dashboard');
  expect(card()?.querySelector('h2')?.textContent).toBe('Push workout');
  expect(
    [...card()!.querySelectorAll('.weekly-review-stats > div')].map((item) => item.textContent),
  ).toEqual(['Time30 min', 'Sets2', 'Volume1,280 kg']);
  // It is a card in the page, not a dialog: nothing is blocked and nothing takes focus.
  expect(document.querySelector('dialog[open]')).toBeNull();
  expect(card()?.closest('.today-screen')).not.toBeNull();

  await act(async () => root.unmount());
  root = createToastRoot(container);
  await mount();
  expect(card()?.querySelector('h2')?.textContent).toBe('Push workout');
});

it('takes the summary down once it is too old, without the app being reopened', async () => {
  liveDraft();
  await mount();
  await finish();
  expect(card()).not.toBeNull();
  // The app stays open, or the phone sleeps, into the next day.
  const later = Date.now() + 19 * 60 * 60 * 1000;
  vi.spyOn(Date, 'now').mockReturnValue(later);
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(card()).toBeNull();
  expect(
    Object.keys(window.localStorage).some((key) => key.startsWith('relay:finished-workout')),
  ).toBe(false);
});

it('lets the summary go when dismissed', async () => {
  liveDraft();
  await mount();
  await finish();
  await click(card()!.querySelector<HTMLButtonElement>('[aria-label="Dismiss workout summary"]')!);
  expect(card()).toBeNull();

  await act(async () => root.unmount());
  root = createToastRoot(container);
  await mount();
  expect(card()).toBeNull();
});

it('lists the records on the card once the workout has synced, with no toast over it', async () => {
  liveDraft();
  let created: TrackedWorkout | null = null;
  // Once saved, the workout is in history, as the server would list it.
  vi.mocked(api.listWorkouts).mockImplementation(async () => (created ? [created] : []));
  // The server echoes the workout's client session, which ties its records to the card.
  vi.mocked(api.createWorkout).mockImplementation(async (payload: WorkoutInput) => {
    created = {
      id: 'saved-workout',
      name: payload.name,
      workout_date: payload.workout_date,
      category: payload.category,
      client_session_id: payload.client_session_id,
      notes: null,
      duration_minutes: payload.duration_minutes,
      start_time: null,
      end_time: null,
      is_sample: false,
      created_at: '2026-11-17T08:00:00Z',
      updated_at: '2026-11-17T08:00:00Z',
      movements: [],
    } as unknown as TrackedWorkout;
    return created;
  });
  vi.mocked(api.listPersonalRecords).mockImplementation(async (filter) =>
    filter?.workoutId === 'saved-workout'
      ? [
          {
            id: 'pr-1',
            exercise_id: bench.id,
            exercise_name: 'Bench press',
            workout_id: 'saved-workout',
            record_type: 'weight',
            scope: 'all_time',
            value: 80,
            weight_kg: 80,
            bodyweight_kg: null,
          } as unknown as PersonalRecord,
        ]
      : [],
  );
  await mount();
  await finish();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  expect(
    [...card()!.querySelectorAll('.finished-workout-records strong')].map(
      (item) => item.textContent,
    ),
  ).toEqual(['Bench press']);
  expect(card()!.querySelector('.finished-workout-records small')?.textContent).toContain(
    'All-time Weight PR',
  );
  expect(document.querySelector('.toast[data-variant="celebrate"]')).toBeNull();
});

describe('a finished workout that is deleted', () => {
  const today = () =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const refresh = () =>
    act(async () => {
      window.dispatchEvent(new Event('training-blocks-updated'));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

  it('leaves Home once a refresh no longer finds its synced workout', async () => {
    liveDraft(today());
    let listed: TrackedWorkout[] = [];
    vi.mocked(api.listWorkouts).mockImplementation(async () => listed);
    vi.mocked(api.createWorkout).mockImplementation(async (payload: WorkoutInput) => {
      listed = [
        {
          id: 'saved-workout',
          name: payload.name,
          workout_date: payload.workout_date,
          category: payload.category,
          client_session_id: payload.client_session_id,
          notes: null,
          duration_minutes: payload.duration_minutes,
          start_time: null,
          end_time: null,
          is_sample: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          movements: [],
        } as unknown as TrackedWorkout,
      ];
      return listed[0];
    });
    await mount();
    await finish();
    await refresh();
    expect(card()).not.toBeNull();

    // Deleted on another device: the next refresh no longer lists it.
    listed = [];
    await refresh();
    expect(card()).toBeNull();
    expect(
      Object.keys(window.localStorage).some((key) => key.startsWith('relay:finished-workout')),
    ).toBe(false);
  });

  it('stays while its workout is still waiting to sync', async () => {
    liveDraft(today());
    vi.mocked(api.createWorkout).mockImplementation(() => new Promise(() => undefined));
    await mount();
    await finish();
    await refresh();
    expect(card()?.querySelector('h2')?.textContent).toBe('Push workout');
  });
});
