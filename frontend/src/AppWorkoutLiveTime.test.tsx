// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
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
const MINUTE = 60_000;
let root: Root;
let container: HTMLDivElement;

/** A live workout whose timer started `minutesAgo` and was last used a minute ago. */
function liveDraft(minutesAgo: number, overrides: Partial<ActiveWorkoutDraft> = {}) {
  const startedAt = Date.now() - minutesAgo * MINUTE;
  const draft: ActiveWorkoutDraft = {
    version: 1,
    startedAt,
    updatedAt: Date.now() - MINUTE,
    lastActiveAt: Date.now() - MINUTE,
    inactiveFinishAt: Date.now() + 3 * 60 * MINUTE,
    name: 'Push workout',
    workoutDate: '2026-10-13',
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
            weight_kg: 80,
            set_type: 'normal',
            warmup: false,
            completed: true,
          },
        ],
      },
    ],
    ...overrides,
  };
  writeActiveWorkoutDraft(draft);
  return draft;
}

async function mount() {
  await act(async () => root.render(<App />));
}

function button(label: string, scope: ParentNode = document) {
  return [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label,
  )!;
}

function timeButton() {
  return container.querySelector<HTMLButtonElement>('.workout-header-time-button');
}

function editor() {
  return document.querySelector<HTMLDialogElement>('.workout-time-editor');
}

function fields() {
  return [...editor()!.querySelectorAll<HTMLInputElement>('input')];
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function correctTime(hours: string, minutes: string) {
  await act(async () => timeButton()!.click());
  await type(fields()[0], hours);
  await type(fields()[1], minutes);
  await act(async () => button('Set time', editor()!).click());
}

async function finish() {
  await act(async () => button('Finish workout', container).click());
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('.workout-finish-dialog .popup-primary-action')!
      .click(),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-13T10:00:00'));
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
  vi.mocked(api.createWorkout).mockReturnValue(new Promise<TrackedWorkout>(() => {}));
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

describe('correcting the live workout time', () => {
  it('adds the time missed by a timer started late and saves the corrected duration', async () => {
    liveDraft(10);
    await mount();
    expect(timeButton()?.textContent).toBe('Live 10:00');
    expect(timeButton()?.getAttribute('aria-label')).toBe('Correct workout time, Live 10:00');

    await act(async () => timeButton()!.click());
    expect(editor()?.textContent).toContain('Workout time so far');
    expect(fields().map((input) => input.value)).toEqual(['0', '10']);
    await type(fields()[1], '45');
    await act(async () => button('Set time', editor()!).click());

    expect(editor()).toBeNull();
    expect(timeButton()?.textContent).toBe('Live 45:00');
    expect(readActiveWorkoutDraft()?.adjustedMs).toBe(35 * MINUTE);
    await finish();
    expect(vi.mocked(api.createWorkout).mock.calls[0][0].duration_minutes).toBe(45);
  });

  it('takes time off a timer that was left running', async () => {
    liveDraft(170);
    await mount();
    expect(timeButton()?.textContent).toBe('Live 2:50:00');
    await correctTime('0', '50');
    expect(timeButton()?.textContent).toBe('Live 50:00');
    expect(readActiveWorkoutDraft()?.adjustedMs).toBe(-120 * MINUTE);
    await finish();
    expect(vi.mocked(api.createWorkout).mock.calls[0][0].duration_minutes).toBe(50);
  });

  it('keeps counting from the corrected time after the app reopens', async () => {
    const draft = liveDraft(10);
    await mount();
    await correctTime('1', '5');
    expect(timeButton()?.textContent).toBe('Live 1:05:00');
    await act(async () => root.unmount());
    vi.setSystemTime(Date.now() + 5 * MINUTE);
    // The session keeps its real start; only the clock moved.
    expect(readActiveWorkoutDraft()?.startedAt).toBe(draft.startedAt);
    root = createRoot(container);
    await mount();
    expect(timeButton()?.textContent).toBe('Live 1:10:00');
  });

  it('leaves the clock alone when the correction is cancelled', async () => {
    liveDraft(10);
    await mount();
    await act(async () => timeButton()!.click());
    await type(fields()[1], '59');
    await act(async () => button('Cancel', editor()!).click());
    expect(editor()).toBeNull();
    expect(timeButton()?.textContent).toBe('Live 10:00');
    expect(readActiveWorkoutDraft()?.adjustedMs).toBeUndefined();
  });

  it('corrects a paused workout without resuming it', async () => {
    liveDraft(30, { pausedMs: 0, pausedAt: Date.now() - 10 * MINUTE });
    await mount();
    expect(timeButton()?.textContent).toBe('20:00');
    await correctTime('0', '25');
    expect(timeButton()?.textContent).toBe('25:00');
    expect(container.querySelector('.workout-header-meta')?.className).toContain('is-paused');
    vi.setSystemTime(Date.now() + 5 * MINUTE);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.workout-header-pause')!.click(),
    );
    expect(timeButton()?.textContent).toBe('Live 25:00');
  });

  it('adds the corrected live time to the minutes a resumed workout already had', async () => {
    liveDraft(10, { resumingWorkoutId: 'existing', previousDurationMinutes: 35 });
    vi.mocked(api.updateWorkout).mockReturnValue(new Promise<TrackedWorkout>(() => {}));
    await mount();
    await correctTime('0', '20');
    await finish();
    expect(vi.mocked(api.updateWorkout).mock.calls[0][1].duration_minutes).toBe(55);
  });
});
