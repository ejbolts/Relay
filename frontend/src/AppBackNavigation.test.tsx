// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
import { createAppHistoryState } from './appNavigation';
import { readDashboardCache, writeDashboardCache } from './workoutCache';
import { createWorkoutSet } from './workoutSets';
import type { DashboardData, Exercise, TrackedWorkout } from './types';

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
    },
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
const workout: TrackedWorkout = {
  id: 'saved-workout',
  name: 'Upper A',
  workout_date: '2026-11-16',
  category: 'push',
  notes: null,
  duration_minutes: 30,
  start_time: null,
  end_time: null,
  is_sample: false,
  created_at: '2026-11-16T08:00:00Z',
  updated_at: '2026-11-16T08:00:00Z',
  movements: [
    {
      id: 'movement',
      order_index: 0,
      exercise: bench,
      notes: null,
      machine_photos: [],
      superset_group_id: null,
      superset_name: null,
      sets: [
        {
          ...createWorkoutSet('strength'),
          id: 'set',
          order_index: 0,
          reps: 8,
          weight_kg: 80,
          incline_percent: null,
          speed_kph: null,
          bodyweight_kg: null,
          percentile: null,
          warmup: false,
          set_type: 'normal',
          failed: false,
          target_reps: null,
          completed: true,
        },
      ],
    },
  ],
};
let root: Root;
let container: HTMLDivElement;
let scrollY = 0;

async function mount() {
  await act(async () => root.render(<App />));
}

async function tap(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('nav button')].find(
    (item) => item.textContent?.trim() === label,
  )!;
  await act(async () => button.click());
}

async function browserBack() {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => window.setTimeout(resolve, 20));
  });
}

const machineFilter = () =>
  [...document.querySelectorAll('dialog[open]')].find((item) =>
    item.textContent?.includes('Filter by machine'),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  scrollY = 0;
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  window.localStorage.clear();
  window.localStorage.setItem('gym-logger-reduce-motion', 'reduced');
  window.history.replaceState(null, '', '#dashboard');
  vi.mocked(api.dashboard).mockResolvedValue({ recommendation: null } as unknown as DashboardData);
  vi.mocked(api.listExercises).mockResolvedValue([bench]);
  vi.mocked(api.listWorkouts).mockResolvedValue([workout]);
  vi.mocked(api.listBodyMeasurements).mockResolvedValue([]);
  vi.mocked(api.listPersonalRecords).mockResolvedValue([]);
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

describe('the tab bar', () => {
  it('switches main screens in place, so Back does not replay each tab', async () => {
    await mount();
    for (const label of ['Training', 'Social', 'Body', 'Training', 'Home']) await tap(label);
    expect(window.location.hash).toBe('#dashboard');
    expect(window.history.state).toEqual(createAppHistoryState('dashboard', 0));
  });

  it('brings each main screen back where it was left', async () => {
    await mount();
    scrollY = 1500;
    await tap('Training');
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0);
    scrollY = 430;
    await tap('Home');
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 1500);
    scrollY = 1500;
    await tap('Training');
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 430);
  });

  it('returns to the top when the current tab is tapped again', async () => {
    await mount();
    scrollY = 900;
    vi.mocked(window.scrollTo).mockClear();
    await tap('Home');
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ top: 0 }));
    expect(window.location.hash).toBe('#dashboard');
  });
});

describe('Back with a sheet open', () => {
  it('closes the sheet and keeps the screen; the next Back changes screen', async () => {
    window.history.replaceState(createAppHistoryState('dashboard', 0), '', '#dashboard');
    window.history.pushState(createAppHistoryState('training', 1), '', '#training');
    await mount();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="Filter by machine"]')!.click(),
    );
    expect(machineFilter()).toBeDefined();

    await browserBack();
    expect(machineFilter()).toBeUndefined();
    expect(window.location.hash).toBe('#training');
    expect(window.history.state).toEqual(createAppHistoryState('training', 1));

    await browserBack();
    expect(window.location.hash).toBe('#dashboard');
  });
});
