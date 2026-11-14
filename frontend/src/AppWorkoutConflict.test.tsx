// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api, ApiError } from './api';
import { readFinishedWorkouts } from './finishedWorkoutQueue';
import { readDashboardCache, writeDashboardCache } from './workoutCache';
import {
  readActiveWorkoutDraft,
  writeActiveWorkoutDraft,
  type ActiveWorkoutDraft,
} from './workoutDraft';
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
const CONFLICT_MESSAGE = 'This workout was changed on another device after you opened it here.';
let root: Root;
let container: HTMLDivElement;

function conflict() {
  return new ApiError(CONFLICT_MESSAGE, 'workout_conflict', 409);
}

function savedWorkout(overrides: Partial<TrackedWorkout> = {}): TrackedWorkout {
  return {
    id: 'saved-workout',
    name: 'Phone workout',
    workout_date: '2026-10-23',
    category: 'push',
    notes: null,
    duration_minutes: 30,
    start_time: null,
    end_time: null,
    is_sample: true,
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

function resumedDraft(overrides: Partial<ActiveWorkoutDraft> = {}): ActiveWorkoutDraft {
  const startedAt = Date.now() - 600_000;
  return {
    version: 1,
    startedAt,
    updatedAt: startedAt,
    lastActiveAt: startedAt,
    inactiveFinishAt: startedAt + 3 * 60 * 60 * 1000,
    resumingWorkoutId: 'saved-workout',
    resumingWorkoutRevision: 3,
    previousDurationMinutes: 30,
    name: 'Phone workout',
    workoutDate: '2026-10-23',
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
        sets: [
          {
            ...createWorkoutSet('strength'),
            key: 'set-0',
            reps: 8,
            weight_kg: 82.5,
            set_type: 'normal',
            warmup: false,
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

function button(label: string, scope: ParentNode = document) {
  return [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label,
  )!;
}

function conflictDialog() {
  return document.querySelector<HTMLDialogElement>('.workout-conflict-dialog');
}

async function editSavedWorkout() {
  window.history.replaceState(null, '', '#training');
  vi.mocked(api.listWorkouts).mockResolvedValue([savedWorkout()]);
  await mount();
  await act(async () =>
    container.querySelector<HTMLButtonElement>('.history-card-summary')!.click(),
  );
  await act(async () => button('Edit', container.querySelector('.workout-actions')!).click());
}

async function saveEdit() {
  await act(async () =>
    container.querySelector<HTMLButtonElement>('.finish-workout-bottom')!.click(),
  );
}

async function finishResumedWorkout() {
  await act(async () => button('Finish workout', container).click());
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('.workout-finish-dialog .popup-primary-action')!
      .click(),
  );
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
  vi.mocked(api.listMachinePhotos).mockResolvedValue([]);
  vi.mocked(api.lastUsedMachinePhotos).mockResolvedValue([]);
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

describe('editing a saved workout that changed on another device', () => {
  it('sends the revision it loaded and saves without a prompt when nothing changed', async () => {
    vi.mocked(api.updateWorkout).mockResolvedValueOnce(savedWorkout({ revision: 4 }));
    await editSavedWorkout();
    await saveEdit();
    expect(api.updateWorkout).toHaveBeenCalledOnce();
    expect(vi.mocked(api.updateWorkout).mock.calls[0][0]).toBe('saved-workout');
    expect(vi.mocked(api.updateWorkout).mock.calls[0][1].base_revision).toBe(3);
    expect(conflictDialog()).toBeNull();
    expect(api.getWorkout).not.toHaveBeenCalled();
  });

  it('keeps this version by saving over the latest revision', async () => {
    vi.mocked(api.updateWorkout)
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce(savedWorkout({ revision: 6 }));
    vi.mocked(api.getWorkout).mockResolvedValueOnce(savedWorkout({ revision: 5 }));
    await editSavedWorkout();
    await saveEdit();
    expect(conflictDialog()?.textContent).toContain('Changed on another device');
    expect(conflictDialog()?.textContent).toContain('Phone workout');
    expect(api.updateWorkout).toHaveBeenCalledOnce();

    await act(async () => button('Keep my version', conflictDialog()!).click());
    expect(conflictDialog()).toBeNull();
    expect(api.getWorkout).toHaveBeenCalledWith('saved-workout');
    expect(api.updateWorkout).toHaveBeenCalledTimes(2);
    const [first, second] = vi.mocked(api.updateWorkout).mock.calls;
    expect(second[1]).toEqual({ ...first[1], base_revision: 5 });
    expect(container.querySelector('.logger-screen')).toBeNull();
    expect(window.location.hash).toBe('#history');
  });

  it('asks again when the workout changes once more before the kept version lands', async () => {
    vi.mocked(api.updateWorkout)
      .mockRejectedValueOnce(conflict())
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce(savedWorkout({ revision: 8 }));
    vi.mocked(api.getWorkout)
      .mockResolvedValueOnce(savedWorkout({ revision: 5 }))
      .mockResolvedValueOnce(savedWorkout({ revision: 7 }));
    await editSavedWorkout();
    await saveEdit();
    await act(async () => button('Keep my version', conflictDialog()!).click());
    expect(conflictDialog()).not.toBeNull();
    await act(async () => button('Keep my version', conflictDialog()!).click());
    expect(conflictDialog()).toBeNull();
    expect(vi.mocked(api.updateWorkout).mock.calls.map((call) => call[1].base_revision)).toEqual([
      3, 5, 7,
    ]);
  });

  it('loads the latest version only after confirming the discard', async () => {
    vi.mocked(api.updateWorkout).mockRejectedValueOnce(conflict());
    await editSavedWorkout();
    await saveEdit();
    await act(async () => button('Load latest', conflictDialog()!).click());
    expect(conflictDialog()?.textContent).toContain('Discard the changes you made here');
    await act(async () => button('Back', conflictDialog()!).click());
    expect(button('Keep my version', conflictDialog()!)).toBeDefined();

    const loads = vi.mocked(api.listWorkouts).mock.calls.length;
    await act(async () => button('Load latest', conflictDialog()!).click());
    await act(async () => button('Discard my changes', conflictDialog()!).click());
    expect(conflictDialog()).toBeNull();
    expect(api.updateWorkout).toHaveBeenCalledOnce();
    expect(api.getWorkout).not.toHaveBeenCalled();
    expect(container.querySelector('.logger-screen')).toBeNull();
    expect(vi.mocked(api.listWorkouts).mock.calls.length).toBeGreaterThan(loads);
  });

  it('keeps the edits open when the prompt is closed', async () => {
    vi.mocked(api.updateWorkout).mockRejectedValueOnce(conflict());
    await editSavedWorkout();
    await saveEdit();
    await act(async () =>
      conflictDialog()!.querySelector<HTMLButtonElement>('.popup-dialog-close')!.click(),
    );
    expect(conflictDialog()).toBeNull();
    expect(api.updateWorkout).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('#log');
    expect(container.querySelector('.logger-screen')?.textContent).toContain(
      'changed on another device; your changes are still here',
    );
  });

  it('leaves other save failures to the ordinary error', async () => {
    vi.mocked(api.updateWorkout).mockRejectedValueOnce(
      new ApiError('Edit imported cardio in its workout.', 'request_failed', 409),
    );
    await editSavedWorkout();
    await saveEdit();
    expect(conflictDialog()).toBeNull();
    expect(container.querySelector('.logger-screen')?.textContent).toContain(
      'Edit imported cardio in its workout.',
    );
  });
});

describe('finishing a resumed workout that changed on another device', () => {
  it('holds the save and keeps this version from the latest revision on request', async () => {
    writeActiveWorkoutDraft(resumedDraft());
    vi.mocked(api.listWorkouts).mockResolvedValue([savedWorkout()]);
    vi.mocked(api.updateWorkout)
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce(savedWorkout({ revision: 6 }));
    vi.mocked(api.getWorkout).mockResolvedValueOnce(savedWorkout({ revision: 5 }));
    await mount();
    await finishResumedWorkout();

    expect(api.updateWorkout).toHaveBeenCalledOnce();
    expect(vi.mocked(api.updateWorkout).mock.calls[0][1].base_revision).toBe(3);
    const card = container.querySelector('.pending-workout-save')!;
    expect(card.textContent).toContain(CONFLICT_MESSAGE);
    expect(button('Review workout', card)).toBeUndefined();
    // The refused changes stay on this device and are not replayed on their own.
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(api.updateWorkout).toHaveBeenCalledOnce();
    expect(readFinishedWorkouts()).toHaveLength(1);

    await act(async () => button('Keep my version', card).click());
    expect(api.getWorkout).toHaveBeenCalledWith('saved-workout');
    expect(api.updateWorkout).toHaveBeenCalledTimes(2);
    const [first, second] = vi.mocked(api.updateWorkout).mock.calls;
    expect(second[0]).toBe('saved-workout');
    expect(second[1]).toEqual({ ...first[1], base_revision: 5 });
    expect(readFinishedWorkouts()).toHaveLength(0);
    expect(container.querySelector('.pending-workout-save')).toBeNull();
  });

  it('discards the held changes after confirming, leaving the other version saved', async () => {
    writeActiveWorkoutDraft(resumedDraft());
    vi.mocked(api.listWorkouts).mockResolvedValue([savedWorkout()]);
    vi.mocked(api.updateWorkout).mockRejectedValueOnce(conflict());
    await mount();
    await finishResumedWorkout();
    const card = container.querySelector('.pending-workout-save')!;
    await act(async () => button('Discard', card).click());
    expect(card.textContent).toContain('These changes have not synced and will be lost.');
    await act(async () => button('Discard workout', card).click());
    expect(readFinishedWorkouts()).toHaveLength(0);
    expect(readActiveWorkoutDraft()).toBeNull();
    expect(api.updateWorkout).toHaveBeenCalledOnce();
    expect(api.getWorkout).not.toHaveBeenCalled();
  });

  it('keeps the changes held when the latest version cannot be checked', async () => {
    writeActiveWorkoutDraft(resumedDraft());
    vi.mocked(api.listWorkouts).mockResolvedValue([savedWorkout()]);
    vi.mocked(api.updateWorkout).mockRejectedValueOnce(conflict());
    vi.mocked(api.getWorkout).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await mount();
    await finishResumedWorkout();
    const card = container.querySelector('.pending-workout-save')!;
    await act(async () => button('Keep my version', card).click());
    expect(api.updateWorkout).toHaveBeenCalledOnce();
    expect(readFinishedWorkouts()).toHaveLength(1);
    expect(card.textContent).toContain('Could not check the latest version. Try again.');
    expect(button('Keep my version', card)).toBeDefined();
  });

  it('remembers the revision a resumed workout was opened from across a reload', async () => {
    writeActiveWorkoutDraft(resumedDraft({ resumingWorkoutRevision: 2 }));
    // Another device has saved since: the list now holds a newer revision.
    vi.mocked(api.listWorkouts).mockResolvedValue([savedWorkout({ revision: 9 })]);
    vi.mocked(api.updateWorkout).mockReturnValueOnce(new Promise(() => {}));
    await mount();
    await finishResumedWorkout();
    expect(vi.mocked(api.updateWorkout).mock.calls[0][1].base_revision).toBe(2);
  });
});
