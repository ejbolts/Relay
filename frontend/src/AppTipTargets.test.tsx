// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
import { openTipTarget } from './tipActions';
import { readDashboardCache, writeDashboardCache } from './workoutCache';
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

const chestPress: Exercise = {
  id: 'chest-press',
  name: 'Machine Chest Press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Machine',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const session = (id: string, date: string, machine: string) =>
  ({
    id,
    name: 'Push',
    workout_date: date,
    category: 'push',
    notes: null,
    duration_minutes: 40,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: `${date}T08:00:00Z`,
    updated_at: `${date}T08:00:00Z`,
    movements: [
      {
        id: `${id}-movement`,
        order_index: 0,
        exercise: chestPress,
        notes: null,
        machine_photos: [{ id: machine }],
        superset_group_id: null,
        superset_name: null,
        sets: [],
      },
    ],
  }) as unknown as TrackedWorkout;
let root: Root;
let container: HTMLDivElement;

async function open(action: Parameters<typeof openTipTarget>[0]) {
  await act(async () => openTipTarget(action));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

beforeEach(async () => {
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
  window.history.replaceState(null, '', '#dashboard');
  vi.mocked(api.dashboard).mockResolvedValue({ recommendation: null } as unknown as DashboardData);
  vi.mocked(api.listExercises).mockResolvedValue([chestPress]);
  vi.mocked(api.listWorkouts).mockResolvedValue([
    session('a', '2026-11-02', 'technogym'),
    session('b', '2026-11-05', 'life-fitness'),
  ]);
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
  root = createRoot(container);
  await act(async () => root.render(<App />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ['split', '#split'],
  ['profile', '#profile'],
  ['appearance', '#settings'],
  ['weight-goal', '#body'],
] as const)('opens %s from a tip', async (target, hash) => {
  await open({ target });
  expect(window.location.hash).toBe(hash);
});

it('opens the Appearance section, not the settings list', async () => {
  await open({ target: 'appearance' });
  // Inside a section, Back is labelled as the way out to the full list.
  expect(container.querySelector('.overlay-screen-header')?.textContent).toContain('All settings');
});

it('opens the weight goal form on Maintain', async () => {
  await open({ target: 'weight-goal' });
  const dialog = [...document.querySelectorAll('dialog')].find((item) =>
    item.textContent?.includes('Add bodyweight goal'),
  );
  expect(dialog?.open).toBe(true);
});

it('opens the exercise that has used two machines for Machine weights', async () => {
  await open({ target: 'machine-weights' });
  expect(window.location.hash).toBe('#progress');
  expect(container.querySelector('.overlay-screen-header')?.textContent).toContain(
    'Machine Chest Press',
  );
});

it('opens Home in edit mode', async () => {
  await open({ target: 'home-edit' });
  expect(container.querySelector('[aria-label="Save Home layout"]')).not.toBeNull();
});
