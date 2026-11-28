// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
import { ToastProvider } from './Toast';
import { readDashboardCache, writeDashboardCache } from './workoutCache';
import {
  readActiveWorkoutDraft,
  writeActiveWorkoutDraft,
  type ActiveWorkoutDraft,
  type StoredDraftSet,
} from './workoutDraft';
import { createWorkoutSet } from './workoutSets';
import type { DashboardData, Exercise } from './types';

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
      updateExercise: vi.fn(),
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

const raise: Exercise = {
  id: 'raise',
  name: 'Lateral Raise',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Shoulders',
  equipment: 'Dumbbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
  extra_reps_enabled: false,
};
const tracked: Exercise = { ...raise, extra_reps_enabled: true };
const run: Exercise = { ...raise, id: 'run', name: 'Running', category: 'cardio', kind: 'cardio' };
let root: Root;
let container: HTMLDivElement;

/** A workout in progress with one exercise and one set that was entered by hand. */
function liveDraft(exercise: Exercise, set: Partial<StoredDraftSet> = {}) {
  const startedAt = Date.now() - 60_000;
  const draft: ActiveWorkoutDraft = {
    version: 1,
    startedAt,
    updatedAt: startedAt,
    lastActiveAt: startedAt,
    inactiveFinishAt: startedAt + 3 * 60 * 60 * 1000,
    name: 'Push workout',
    workoutDate: '2026-11-28',
    category: exercise.kind === 'cardio' ? 'cardio' : 'push',
    notes: '',
    movements: [
      {
        key: 'movement-0',
        exerciseId: exercise.id,
        notes: '',
        machinePhotoIds: [],
        supersetKey: null,
        isComplete: false,
        sets: [
          {
            ...createWorkoutSet(exercise.kind),
            key: 'set-0',
            set_type: 'normal',
            warmup: false,
            completed: false,
            ...set,
          },
        ],
      },
    ],
  };
  writeActiveWorkoutDraft(draft);
}

async function mount() {
  await act(async () =>
    root.render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    ),
  );
}

const field = (name: string) =>
  container.querySelector<HTMLInputElement>(`[data-set-field="${name}"]`);

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(element: Element | null | undefined) {
  if (!element) throw new Error('Nothing to click');
  await act(async () => {
    (element as HTMLElement).click();
    // Lets a save started by the click answer and confirm itself.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const toast = () => document.querySelector('.toast')?.textContent;

const menuItem = () =>
  [...container.querySelectorAll<HTMLButtonElement>('.movement-overflow-menu button')].find(
    (button) => button.textContent?.includes('Partial & assisted reps'),
  );

const draftSet = () => readActiveWorkoutDraft()!.movements[0].sets[0];

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
  vi.mocked(api.listExercises).mockResolvedValue([raise, run]);
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
  vi.mocked(api.listMachinePhotos).mockResolvedValue([]);
  vi.mocked(api.lastUsedMachinePhotos).mockResolvedValue([]);
  vi.mocked(api.updateExercise).mockResolvedValue(tracked);
  vi.mocked(readDashboardCache).mockResolvedValue(null);
  vi.mocked(writeDashboardCache).mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('partial and assisted reps in the logger', () => {
  it('offers the two fields once the exercise tracks them, from its menu', async () => {
    liveDraft(raise, { weight_kg: 10, reps: 12 });
    await mount();
    expect(field('reps')).not.toBeNull();
    expect(field('partial_reps')).toBeNull();
    expect(menuItem()?.getAttribute('aria-pressed')).toBe('false');

    await click(menuItem());
    expect(api.updateExercise).toHaveBeenCalledExactlyOnceWith('raise', {
      extra_reps_enabled: true,
    });
    expect(menuItem()?.getAttribute('aria-pressed')).toBe('true');
    expect(toast()).toContain('Partial and assisted reps on for Lateral Raise');
    expect(field('partial_reps')?.getAttribute('aria-label')).toBe('Partial reps for set 1');
    expect(field('assisted_reps')?.getAttribute('aria-label')).toBe('Assisted reps for set 1');
  });

  it('logs them with the set and shows them under the folded row', async () => {
    vi.mocked(api.listExercises).mockResolvedValue([tracked]);
    liveDraft(tracked, { weight_kg: 10, reps: 12 });
    await mount();
    await type(field('partial_reps')!, '4');
    await type(field('assisted_reps')!, '2x');
    expect(draftSet()).toMatchObject({ reps: 12, partial_reps: 4, assisted_reps: 2 });

    await click(container.querySelector('.row-complete-button'));
    expect(draftSet()).toMatchObject({ completed: true, reps: 12, partial_reps: 4 });
    const line = container.querySelector<HTMLButtonElement>('.completed-set-extra-reps')!;
    expect(line.textContent).toBe('+4 partial · +2 assisted');
    expect(line.getAttribute('aria-label')).toBe('Edit 4 partial reps, 2 assisted reps for set 1');
    // The full reps stay the set's reps.
    expect(container.querySelector('.completed-set-reps')?.textContent).toBe('12');

    // The line opens the set at the field it describes.
    await click(line);
    expect(document.activeElement).toBe(field('partial_reps'));
    await type(field('partial_reps')!, '');
    expect(draftSet().partial_reps).toBeNull();
  });

  it('logs a set of partial reps alone as 0 full reps instead of asking for reps', async () => {
    vi.mocked(api.listExercises).mockResolvedValue([tracked]);
    liveDraft(tracked, { weight_kg: 10 });
    await mount();
    await click(container.querySelector('.row-complete-button'));
    expect(container.querySelector('.set-entry-error')?.textContent).toBe(
      'Enter reps to log this set.',
    );
    await type(field('partial_reps')!, '15');
    await click(container.querySelector('.row-complete-button'));
    expect(draftSet()).toMatchObject({ completed: true, reps: 0, partial_reps: 15 });
    expect(container.querySelector('.completed-set-reps')?.textContent).toBe('0');
  });

  it('keeps showing reps a set already has after tracking is turned off', async () => {
    liveDraft(raise, { weight_kg: 10, reps: 12, assisted_reps: 3 });
    await mount();
    expect(field('assisted_reps')?.value).toBe('3');
    expect(field('partial_reps')?.value).toBe('');
  });

  it('is not offered on cardio', async () => {
    liveDraft(run, { duration_seconds: 600 });
    await mount();
    expect(container.querySelector('.movement-overflow-menu')).not.toBeNull();
    expect(menuItem()).toBeUndefined();
    expect(field('partial_reps')).toBeNull();
  });

  it('says so when the exercise could not be changed', async () => {
    vi.mocked(api.updateExercise).mockRejectedValue(new Error('You are offline.'));
    liveDraft(raise, { weight_kg: 10, reps: 12 });
    await mount();
    await click(menuItem());
    expect(toast()).toContain('You are offline.');
    expect(field('partial_reps')).toBeNull();
  });
});
