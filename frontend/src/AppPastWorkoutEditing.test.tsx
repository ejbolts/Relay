// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
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
      createWorkout: vi.fn(),
      updateWorkout: vi.fn(),
      deleteWorkout: vi.fn(),
      getWorkout: vi.fn(),
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

const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

function savedWorkout(overrides: Partial<TrackedWorkout> = {}): TrackedWorkout {
  return {
    id: 'saved-workout',
    name: 'Upper A',
    workout_date: '2026-10-23',
    category: 'push',
    notes: null,
    duration_minutes: 30,
    start_time: null,
    end_time: null,
    is_sample: false,
    revision: 3,
    created_at: '2026-10-23T01:00:00Z',
    updated_at: '2026-10-23T01:00:00Z',
    movements: [
      {
        id: 'saved-movement',
        order_index: 0,
        exercise: bench,
        notes: null,
        machine_photos: [],
        superset_group_id: null,
        superset_name: null,
        sets: [
          {
            ...createWorkoutSet('strength'),
            id: 'saved-set',
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
    ...overrides,
  };
}

async function mount() {
  await act(async () => root.render(<App />));
}

async function settle() {
  await act(async () => new Promise((resolve) => window.setTimeout(resolve, 30)));
}

function button(label: string, scope: ParentNode = document) {
  return [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label,
  )!;
}

const discardDialog = () => document.querySelector<HTMLDialogElement>('.discard-changes-dialog');
const editorBack = () =>
  container.querySelector<HTMLButtonElement>('.logger-screen .overlay-header-back')!;
const notes = () => container.querySelector<HTMLTextAreaElement>('.workout-notes textarea')!;
const toast = () => document.querySelector('.toast');

function type(element: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
    element,
    value,
  );
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

async function openCard(workouts: TrackedWorkout[] = [savedWorkout()]) {
  window.history.replaceState(null, '', '#training');
  vi.mocked(api.listWorkouts).mockResolvedValue(workouts);
  await mount();
  await act(async () =>
    container.querySelector<HTMLButtonElement>('.history-card-summary')!.click(),
  );
}

async function editSavedWorkout() {
  await openCard();
  await act(async () => button('Edit', container.querySelector('.workout-actions')!).click());
  expect(container.querySelector('.logger-screen')).not.toBeNull();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.workoutRevision).mockResolvedValue({ revision: 'initial' });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
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
  vi.mocked(api.dashboard).mockResolvedValue({ recommendation: null } as unknown as DashboardData);
  vi.mocked(api.listExercises).mockResolvedValue([bench]);
  vi.mocked(api.listWorkouts).mockResolvedValue([]);
  vi.mocked(api.listBodyMeasurements).mockResolvedValue([]);
  vi.mocked(api.listPersonalRecords).mockResolvedValue([]);
  vi.mocked(api.deleteWorkout).mockResolvedValue(undefined);
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

describe('editing a past workout', () => {
  it('puts Save beside Delete in the header', async () => {
    await editSavedWorkout();
    const actions = container.querySelector('.logger-screen .overlay-header-actions')!;
    expect(
      [...actions.querySelectorAll('button')].map(
        (item) => item.getAttribute('aria-label') ?? item.textContent,
      ),
    ).toEqual(['Delete workout', 'Save']);
    // Adding an exercise stays after the last one.
    expect(button('＋ Add exercise', container)).toBeDefined();
  });

  it('leaves straight away when nothing changed', async () => {
    await editSavedWorkout();
    await act(async () => editorBack().click());
    await settle();
    expect(discardDialog()).toBeNull();
    await vi.waitFor(() => expect(window.location.hash).toBe('#training'));
  });

  it('asks before Back throws away a change, and keeps it until Discard', async () => {
    await editSavedWorkout();
    await act(async () => type(notes(), 'Felt strong'));
    await act(async () => editorBack().click());
    await settle();
    expect(discardDialog()?.textContent).toContain('Discard changes?');
    expect(window.location.hash).toBe('#log');

    await act(async () => button('Keep editing', discardDialog()!).click());
    expect(discardDialog()).toBeNull();
    expect(notes().value).toBe('Felt strong');

    await act(async () => editorBack().click());
    await act(async () => button('Discard', discardDialog()!).click());
    await settle();
    await vi.waitFor(() => expect(window.location.hash).toBe('#training'));
    expect(container.querySelector('.logger-screen')).toBeNull();
    expect(api.updateWorkout).not.toHaveBeenCalled();
  });

  it("asks on the browser's Back too, staying on the editor", async () => {
    await editSavedWorkout();
    await act(async () => type(notes(), 'Felt strong'));
    await act(async () => window.history.back());
    await settle();
    expect(discardDialog()).not.toBeNull();
    expect(window.location.hash).toBe('#log');
    expect(notes().value).toBe('Felt strong');
  });

  it('saves from the header, then returns to Training with a toast', async () => {
    vi.mocked(api.updateWorkout).mockResolvedValueOnce(
      savedWorkout({ revision: 4, notes: 'Felt strong' }),
    );
    await editSavedWorkout();
    await act(async () => type(notes(), 'Felt strong'));
    await act(async () => button('Save', container).click());
    await settle();
    expect(api.updateWorkout).toHaveBeenCalledOnce();
    expect(vi.mocked(api.updateWorkout).mock.calls[0][1].notes).toBe('Felt strong');
    expect(discardDialog()).toBeNull();
    await vi.waitFor(() => expect(window.location.hash).toBe('#training'));
    expect(container.querySelector('.logger-screen')).toBeNull();
    expect(toast()?.textContent).toContain('Workout saved');
  });

  it('stays in the editor with the changes when the save fails', async () => {
    vi.mocked(api.updateWorkout).mockRejectedValueOnce(new Error('Could not reach the server.'));
    await editSavedWorkout();
    await act(async () => type(notes(), 'Felt strong'));
    await act(async () => button('Save', container).click());
    await settle();
    expect(window.location.hash).toBe('#log');
    expect(container.textContent).toContain('Could not reach the server.');
    expect(notes().value).toBe('Felt strong');
    expect(toast()).toBeNull();
  });
});

describe('past workout actions', () => {
  const actionLabels = () =>
    [...container.querySelectorAll('.history-card.open .workout-actions > button')].map(
      (item) => `${item.textContent}${item.classList.contains('is-main') ? ' (main)' : ''}`,
    );

  it('makes Edit the main action of an older workout, without Resume', async () => {
    await openCard();
    expect(container.querySelector('.resume-workout-button')).toBeNull();
    expect(actionLabels()).toEqual(['Edit (main)', 'Delete']);
  });

  it("keeps Resume first for today's workout", async () => {
    await openCard([savedWorkout({ workout_date: today(), created_at: new Date().toISOString() })]);
    expect(actionLabels()).toEqual(['Resume', 'Edit', 'Delete']);
  });

  it('hides a deleted workout at once, with an Undo before it is removed', async () => {
    await openCard();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => button('Delete', container).click());
    await act(async () => button('Confirm delete', container).click());
    expect(container.querySelector('.history-card')).toBeNull();
    expect(toast()?.textContent).toContain('Workout deleted');

    await act(async () => button('Undo', toast()!).click());
    expect(toast()).toBeNull();
    expect(container.querySelector('.history-card.open')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(api.deleteWorkout).not.toHaveBeenCalled();

    await act(async () => button('Delete', container).click());
    await act(async () => button('Confirm delete', container).click());
    await act(async () => vi.advanceTimersByTime(5_999));
    expect(api.deleteWorkout).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(api.deleteWorkout).toHaveBeenCalledExactlyOnceWith('saved-workout');
    expect(toast()).toBeNull();
  });
});
