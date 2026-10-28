// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { createAppHistoryState } from './appNavigation';
import { BEFORE_APP_REFRESH_EVENT } from './appUpdates';
import { api } from './api';
import * as push from './push';
import { readDashboardCache, writeDashboardCache } from './workoutCache';
import {
  ACTIVE_WORKOUT_DRAFT_KEY,
  readActiveWorkoutDraft,
  writeActiveWorkoutDraft,
  type ActiveWorkoutDraft,
} from './workoutDraft';
import { isStrengthPrEligible } from './workoutPr';
import { createWorkoutSet } from './workoutSets';
import type {
  DashboardData,
  Exercise,
  TrackedWorkout,
  WorkoutInput,
  WeeklyMuscleContribution,
} from './types';

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
const row: Exercise = { ...bench, id: 'row', name: 'Cable row', category: 'pull' };
let root: Root;
let container: HTMLDivElement;

function storedDraft(overrides: Partial<ActiveWorkoutDraft> = {}): ActiveWorkoutDraft {
  const startedAt = Date.now() - 600_000;
  return {
    version: 1,
    startedAt,
    updatedAt: startedAt,
    lastActiveAt: startedAt,
    inactiveFinishAt: startedAt + 3 * 60 * 60 * 1000,
    name: 'Recovery workout',
    workoutDate: '2026-10-13',
    category: 'upper',
    notes: 'Workout notes survive',
    movements: [bench, row].map((exercise, index) => ({
      key: `movement-${index}`,
      exerciseId: exercise.id,
      notes: `${exercise.name} notes survive`,
      machinePhotoIds: [`sample-photo-${index}`],
      supersetKey: 'sample-superset',
      isComplete: false,
      sets: [
        {
          ...createWorkoutSet('strength'),
          key: `set-${index}`,
          reps: 8,
          weight_kg: 80,
          set_type: 'normal',
          warmup: false,
          notes: 'Set notes survive',
          completed: true,
        },
      ],
    })),
    ...overrides,
  };
}

async function mount() {
  await act(async () => root.render(<App />));
}

describe('muscle contribution workout links', () => {
  const contribution: WeeklyMuscleContribution = {
    workout_id: 'saved-upper',
    workout_name: 'Saved upper body',
    workout_date: '2026-10-19',
    movement_id: 'second-row',
    exercise_id: 'row',
    exercise_name: 'Cable row',
    working_sets: 1,
    credit_per_set: 0.5,
    set_credits: 0.5,
  };
  function savedWorkout(): TrackedWorkout {
    return {
      id: contribution.workout_id,
      name: contribution.workout_name,
      workout_date: contribution.workout_date,
      category: 'upper',
      notes: null,
      duration_minutes: 30,
      start_time: null,
      end_time: null,
      is_sample: true,
      created_at: '2026-10-19T10:00:00Z',
      updated_at: '2026-10-19T10:00:00Z',
      movements: ['first-bench', 'second-row'].map((id, index) => ({
        id,
        order_index: index,
        notes: index ? 'Second appearance' : 'First appearance',
        exercise: index ? row : bench,
        machine_photos: [],
        superset_group_id: null,
        superset_name: null,
        sets: [
          {
            id: `${id}-set`,
            order_index: 0,
            reps: 8,
            weight_kg: index ? 90 : 80,
            rpe: 8,
            rest_seconds: 180,
            duration_seconds: null,
            distance_km: null,
            incline_percent: null,
            speed_kph: null,
            bodyweight_kg: null,
            percentile: null,
            warmup: false,
            set_type: 'normal',
            failed: false,
            target_reps: null,
            notes: null,
            completed: true,
          },
        ],
      })),
    };
  }
  async function openSheet() {
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Exercises contributing to Biceps"]')!
        .click(),
    );
  }
  async function openExercise() {
    await act(async () =>
      document.querySelector<HTMLButtonElement>('.muscle-contribution-list button')!.click(),
    );
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 60)));
  }
  beforeEach(() => {
    window.history.replaceState(null, '', '#dashboard');
    HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.mocked(api.dashboard).mockResolvedValue({
      recommendation: null,
      weekly_sets: {
        week_start: '2026-10-19',
        week_end: '2026-10-25',
        muscle_groups: [
          {
            muscle_group: 'Biceps',
            raw_sets: 0.5,
            effective_sets: 0.5,
            average_rpe: 8,
            contributions: [contribution],
          },
        ],
      },
    } as unknown as DashboardData);
  });
  it('opens the source workout read-only at the chosen exercise, including on a second opening', async () => {
    const anotherWorkout = {
      ...savedWorkout(),
      id: 'newer-upper',
      name: 'Another saved session',
      created_at: '2026-10-19T12:00:00Z',
    };
    vi.mocked(api.listWorkouts).mockResolvedValue([anotherWorkout, savedWorkout()]);
    await mount();
    await openSheet();
    await openExercise();
    expect(window.location.hash).toBe('#history');
    expect(document.querySelector('dialog')).toBeNull();
    expect(container.querySelector('.history-card.open')?.textContent).toContain(
      'Saved upper body',
    );
    const firstTarget = container.querySelector('.targeted-exercise')!;
    expect(container.querySelectorAll('.targeted-exercise')).toHaveLength(1);
    expect(firstTarget.textContent).toContain('Second appearance');
    expect(document.activeElement).toBe(firstTarget);
    expect(container.querySelector('.logger-screen')).toBeNull();
    const home = [...container.querySelectorAll<HTMLButtonElement>('nav button')].find(
      (button) => button.textContent?.trim() === 'Home',
    )!;
    await act(async () => home.click());
    await openSheet();
    await openExercise();
    const secondTarget = container.querySelector('.targeted-exercise')!;
    expect(secondTarget).not.toBe(firstTarget);
    expect(document.activeElement).toBe(secondTarget);
    expect(api.createWorkout).not.toHaveBeenCalled();
    expect(api.updateWorkout).not.toHaveBeenCalled();
  });
  it('loads the source day if the dashboard is newer than the local workout snapshot', async () => {
    const load = vi
      .spyOn(api, 'listOlderHistory')
      .mockResolvedValue({ workouts: [savedWorkout()], heatmap: [] });
    await mount();
    await openSheet();
    await openExercise();
    expect(load).toHaveBeenCalledWith('2026-10-19', '2026-10-19');
    expect(container.querySelector('.targeted-exercise')?.textContent).toContain(
      'Second appearance',
    );
    expect(window.location.hash).toBe('#history');
    expect(api.createWorkout).not.toHaveBeenCalled();
    expect(api.updateWorkout).not.toHaveBeenCalled();
  });
  it('preserves an active workout while viewing the contributing exercise', async () => {
    const draft = storedDraft({ workoutDate: '2026-10-18' });
    writeActiveWorkoutDraft(draft);
    vi.mocked(api.listWorkouts).mockResolvedValue([savedWorkout()]);
    await mount();
    await openSheet();
    await openExercise();
    expect(window.location.hash).toBe('#history');
    expect(container.querySelector('.targeted-exercise')?.textContent).toContain(
      'Second appearance',
    );
    expectPreserved(draft);
    expect(container.querySelector('.logger-screen')?.closest('[hidden]')).not.toBeNull();
    expect(api.createWorkout).not.toHaveBeenCalled();
    expect(api.updateWorkout).not.toHaveBeenCalled();
  });
  it('keeps the sheet open with a useful message when a linked workout was removed', async () => {
    vi.spyOn(api, 'listOlderHistory').mockResolvedValue({ workouts: [], heatmap: [] });
    await mount();
    await openSheet();
    await openExercise();
    expect(window.location.hash).toBe('#dashboard');
    expect(document.querySelector('dialog [role="alert"]')?.textContent).toContain(
      'no longer available',
    );
    expect(api.createWorkout).not.toHaveBeenCalled();
    expect(api.updateWorkout).not.toHaveBeenCalled();
  });
});

function retry() {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent === 'Retry loading exercises',
  );
  expect(button).toBeDefined();
  button!.click();
}

function expectPreserved(draft: ActiveWorkoutDraft) {
  const recovered = readActiveWorkoutDraft();
  expect(recovered).toMatchObject({
    startedAt: draft.startedAt,
    name: draft.name,
    workoutDate: draft.workoutDate,
    category: draft.category,
    notes: draft.notes,
    movements: draft.movements,
  });
}

async function confirmFinish() {
  const finish = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Finish workout',
  )!;
  await act(async () => finish.click());
  const confirm = document.querySelector<HTMLButtonElement>(
    '.workout-finish-dialog .popup-primary-action',
  )!;
  await act(async () => confirm.click());
}

function restoreOldLoggerLocation() {
  const state = createAppHistoryState('log', 0);
  window.history.replaceState(state, '', '#log');
  window.dispatchEvent(new PopStateEvent('popstate', { state }));
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
  vi.mocked(api.listExercises).mockResolvedValue([bench, row]);
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

it('uses the top header to return from settings sections before leaving settings', async () => {
  window.history.replaceState(null, '', '#settings');
  HTMLElement.prototype.scrollIntoView = vi.fn();
  await mount();
  const headerBack = () => container.querySelector<HTMLButtonElement>('.overlay-header-back')!;
  expect(headerBack().getAttribute('aria-label')).toBe('Go back');
  const cards = [...container.querySelectorAll<HTMLButtonElement>('.settings-category-card')];
  expect(cards.length).toBeGreaterThan(0);
  for (const card of cards) {
    await act(async () => card.click());
    expect(headerBack().getAttribute('aria-label')).toBe('All settings');
    expect(container.querySelector('.overlay-header-copy')?.textContent).toBe('All settings');
    expect(container.querySelector('.settings-all-button')).toBeNull();
    await act(async () => headerBack().click());
    expect(window.location.hash).toBe('#settings');
    expect(container.querySelector('.settings-overview')?.hasAttribute('hidden')).toBe(false);
    expect(headerBack().getAttribute('aria-label')).toBe('Go back');
  }
  await act(async () => headerBack().click());
  expect(window.location.hash).toBe('#dashboard');
});

it.each(['Home', 'Training', 'Body'])(
  'opens All settings from the %s header after visiting a section',
  async (page) => {
    window.history.replaceState(null, '', '#settings');
    HTMLElement.prototype.scrollIntoView = vi.fn();
    await mount();
    const appearance = [
      ...container.querySelectorAll<HTMLButtonElement>('.settings-category-card'),
    ].find((button) => button.textContent?.includes('Appearance'))!;
    await act(async () => appearance.click());
    expect(container.querySelector('.settings-overview')?.hasAttribute('hidden')).toBe(true);
    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Main navigation"] button')]
        .find((button) => button.textContent?.trim() === page)!
        .click(),
    );
    const settings = [
      ...container.querySelectorAll<HTMLButtonElement>('[aria-label="Settings"]'),
    ].find((button) => !button.closest('[hidden]'))!;
    expect(settings).toBeDefined();
    await act(async () => settings.click());
    expect(window.location.hash).toBe('#settings');
    expect(container.querySelector('.settings-overview')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('.overlay-header-back')?.getAttribute('aria-label')).toBe(
      'Go back',
    );
  },
);

it('keeps settings search navigation working after the header resets a previous search jump', async () => {
  window.history.replaceState(null, '', '#settings');
  HTMLElement.prototype.scrollIntoView = vi.fn();
  await mount();
  const searchRest = async () => {
    const input = container.querySelector<HTMLInputElement>('.settings-search input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'Rest timer',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const result = [
      ...container.querySelectorAll<HTMLButtonElement>('.settings-search button'),
    ].find((button) => button.querySelector('strong')?.textContent === 'Rest timer')!;
    await act(async () => result.click());
    expect(container.querySelector('.settings-hub')?.classList.contains('has-selection')).toBe(
      true,
    );
    expect(
      container.querySelector('[data-settings-group="training"]')?.hasAttribute('hidden'),
    ).toBe(false);
  };
  await searchRest();
  await navigateTo('Body');
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Settings"]')]
      .find((button) => !button.closest('[hidden]'))!
      .click(),
  );
  expect(container.querySelector('.settings-overview')?.hasAttribute('hidden')).toBe(false);
  await searchRest();
});

describe('RPE and set type presentation', () => {
  async function click(label: string) {
    const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    expect(button).not.toBeNull();
    await act(async () => button.click());
  }

  it('keeps edited RPE values on the number through folding, clearing and draft recovery', async () => {
    const draft = storedDraft();
    draft.movements = [draft.movements[0]];
    draft.movements[0].sets[0].rpe = 9;
    writeActiveWorkoutDraft(draft);
    await mount();
    const summary = () => container.querySelector<HTMLButtonElement>('.completed-set-rpe')!;
    expect(summary().textContent).toBe('9');
    expect(summary().dataset.rpe).toBe('9');

    for (const value of ['10', '9.5', '8', '6.5', '5', '']) {
      await click('Edit RPE for set 1');
      const editor = container.querySelector<HTMLSelectElement>('[data-set-field="rpe"]')!;
      await act(async () => {
        editor.value = value;
        editor.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(editor.dataset.rpe).toBe(value || undefined);
      expect(readActiveWorkoutDraft()?.movements[0].sets[0].rpe).toBe(value ? Number(value) : null);
      await click('Done editing set 1');
      expect(summary().textContent).toBe(value || '–');
      expect(summary().dataset.rpe).toBe(value || undefined);
      expect(container.querySelector('.set-details')?.getAttribute('data-set-type')).toBe('normal');
    }

    await act(async () => root.unmount());
    root = createRoot(container);
    await mount();
    expect(summary().textContent).toBe('–');
    expect(summary().hasAttribute('data-rpe')).toBe(false);
  });

  it('keeps type and RPE independent when changing a completed set, reopening and unticking it', async () => {
    const draft = storedDraft();
    draft.movements = [draft.movements[0]];
    draft.movements[0].sets[0].rpe = 10;
    writeActiveWorkoutDraft(draft);
    await mount();
    const row = () => container.querySelector<HTMLElement>('.set-details')!;
    for (const [label, kind] of [
      ['Warm-up', 'warmup'],
      ['Drop set', 'drop'],
      ['Failure', 'failure'],
      ['Working set', 'normal'],
    ]) {
      await act(async () => row().querySelector<HTMLButtonElement>('.set-number-cell')!.click());
      const option = [
        ...container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
      ].find((button) => button.textContent?.endsWith(label))!;
      await act(async () => option.click());
      expect(row().dataset.setType).toBe(kind);
      expect(row().classList.contains('completed')).toBe(true);
      expect(row().querySelector<HTMLElement>('.completed-set-rpe')?.dataset.rpe).toBe('10');
      expect(readActiveWorkoutDraft()?.movements[0].sets[0].rpe).toBe(10);
      await click('Edit RPE for set 1');
      expect(row().dataset.setType).toBe(kind);
      expect(row().querySelector<HTMLElement>('[data-set-field="rpe"]')?.dataset.rpe).toBe('10');
      await click('Done editing set 1');
    }
    await click('Mark set 1 incomplete');
    expect(row().classList.contains('completed')).toBe(false);
    expect(row().dataset.setType).toBe('normal');
    expect(row().querySelector<HTMLElement>('[data-set-field="rpe"]')?.dataset.rpe).toBe('10');
  });
});

describe('saved training splits on Home', () => {
  const custom = {
    id: 'custom-a',
    name: 'Full body A',
    color: '#123456',
    is_custom: true,
    archived: false,
  };
  const recommendation = {
    category: 'other',
    session_name: 'Full body A workout',
    rotation_next: 'other',
    reason: 'Day 1',
    muscle_frequency: [],
    workout_type: custom,
    split_name: 'My split',
    scheduled_date: '2026-10-26',
  };
  beforeEach(() => {
    window.history.replaceState(null, '', '#dashboard');
    vi.spyOn(api, 'getWorkoutTypes').mockResolvedValue([custom]);
    vi.mocked(api.dashboard).mockResolvedValue({ recommendation } as unknown as DashboardData);
  });

  it('opens the full editor from the Home shortcut', async () => {
    vi.spyOn(api, 'getTrainingSplit').mockResolvedValue(null);
    await mount();
    const edit = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === 'Edit split',
    )!;
    await act(async () => edit.click());
    expect(window.location.hash).toBe('#split');
    expect(container.querySelector('[aria-label="Training split editor"]')).not.toBeNull();
    expect(container.querySelector('.tab-bar')).toBeNull();
  });

  it('preserves later navigation when a split save finishes in the background', async () => {
    const split = {
      name: 'My split',
      enabled: true,
      start_date: '2026-10-26',
      steps: [{ workout_type_id: custom.id }],
    };
    vi.spyOn(api, 'getTrainingSplit').mockResolvedValue(split);
    let finish!: (value: typeof split) => void;
    vi.spyOn(api, 'saveTrainingSplit').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await mount();
    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((item) => item.textContent === 'Edit split')!
        .click(),
    );
    await act(async () =>
      container
        .querySelector('.split-editor form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('.overlay-screen-header [aria-label="Settings"]')!
        .click(),
    );
    expect(window.location.hash).toBe('#settings');
    await act(async () => finish(split));
    expect(window.location.hash).toBe('#settings');
  });

  it('starts the scheduled custom type even without a previous workout of that type', async () => {
    await mount();
    const start = container.querySelector<HTMLButtonElement>('.next-session-actions button')!;
    await act(async () => start.click());
    expect(window.location.hash).toBe('#log');
    expect(readActiveWorkoutDraft()).toMatchObject({
      category: 'other',
      workoutTypeId: 'custom-a',
      workoutTypeExplicit: true,
    });
  });

  it('shows a rest day without offering it as a workout in the Start menu', async () => {
    vi.mocked(api.dashboard).mockResolvedValue({
      recommendation: { ...recommendation, workout_type: null, is_rest_day: true },
    } as unknown as DashboardData);
    await mount();
    expect(container.querySelector('#next-session-title')?.textContent).toBe('Rest day');
    expect(container.querySelector('.next-session-exercises')).toBeNull();
    const start = container.querySelector<HTMLButtonElement>('[aria-label="Start workout"]')!;
    await act(async () => start.click());
    expect(container.querySelector('.start-menu')?.textContent).not.toContain('Rest day');
  });

  it('refreshes the scheduled day after local midnight even when training has not changed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T23:59:59'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await mount();
    const before = vi.mocked(api.dashboard).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(vi.mocked(api.dashboard).mock.calls.length).toBeGreaterThan(before);
  });

  it('rechecks the day when a dashboard response crosses local midnight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T23:59:59'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    let finish!: (value: DashboardData) => void;
    vi.mocked(api.dashboard).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await mount();
    expect(api.dashboard).toHaveBeenCalledOnce();
    vi.setSystemTime(new Date('2026-10-27T00:00:01'));
    await act(async () => finish({ recommendation } as unknown as DashboardData));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(vi.mocked(api.dashboard).mock.calls.length).toBeGreaterThan(1);
  });
});

describe('rest time controls', () => {
  function restControl() {
    return (
      container
        .querySelector('.movement-card')
        ?.querySelector<HTMLSelectElement>('[aria-label="Rest after set 1"]') ?? null
    );
  }

  async function click(label: string) {
    const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
    expect(button).not.toBeNull();
    await act(async () => button!.click());
  }

  async function choose(label: string, value: string) {
    const select = container.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
    await act(async () => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  async function startRest(serverScheduled = false) {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(push, 'pushNotificationsSupported').mockReturnValue(serverScheduled);
    vi.spyOn(push, 'existingPhonePushSubscription').mockResolvedValue(
      serverScheduled
        ? ({ endpoint: 'https://push.example.com/sample' } as PushSubscription)
        : null,
    );
    vi.spyOn(api, 'scheduleRestTimerNotification').mockResolvedValue(undefined);
    vi.spyOn(api, 'scheduleActiveWorkoutReminder').mockResolvedValue(undefined);
    vi.spyOn(api, 'cancelActiveWorkoutReminder').mockResolvedValue(undefined);
    const systemNotification = vi
      .spyOn(push, 'showRestTimerNotification')
      .mockResolvedValue(undefined);
    const draft = storedDraft();
    draft.movements[0].sets[0].completed = false;
    draft.movements[0].sets[0].rest_seconds = 30;
    writeActiveWorkoutDraft(draft);
    await mount();
    await click('Complete set 1');
    return systemNotification;
  }

  it.each([false, true])(
    'alerts above other tabs after a dismissed countdown (server push scheduled: %s)',
    async (scheduled) => {
      const systemNotification = await startRest(scheduled);
      await click('Dismiss rest timer popup and show it beside the live time');
      await act(async () =>
        container.querySelector<HTMLButtonElement>('.overlay-header-back')!.click(),
      );
      await act(async () =>
        container.querySelector<HTMLButtonElement>('.app-tab[data-guide-target="body"]')!.click(),
      );
      expect(window.location.hash).toBe('#body');
      await act(async () => vi.advanceTimersByTimeAsync(30_000));
      expect(document.querySelector('.app-notification-toast')?.textContent).toContain(
        'Rest complete. Time for your next set.',
      );
      expect(systemNotification).not.toHaveBeenCalled();
      if (scheduled) expect(api.scheduleRestTimerNotification).toHaveBeenCalled();
      // Dismissal and returning focus must not announce the same timer a second time.
      await act(async () =>
        document.querySelector<HTMLButtonElement>('[aria-label="Close notification"]')!.click(),
      );
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(document.querySelector('.app-notification-toast')).toBeNull();
    },
  );

  it('does not announce a cancelled rest', async () => {
    await startRest();
    await click('Cancel rest timer');
    await act(async () => vi.advanceTimersByTimeAsync(31_000));
    expect(document.querySelector('.app-notification-toast')).toBeNull();
  });

  it.each([false, true])(
    'preserves background notification delivery (server scheduled: %s)',
    async (scheduled) => {
      const systemNotification = await startRest(scheduled);
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      await act(async () => vi.advanceTimersByTimeAsync(30_000));
      expect(document.querySelector('.app-notification-toast')).toBeNull();
      expect(systemNotification).toHaveBeenCalledTimes(scheduled ? 0 : 1);
    },
  );

  it('checks an overdue timer immediately when the visible app regains focus', async () => {
    await startRest();
    vi.setSystemTime(Date.now() + 31_000);
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(document.querySelector('.app-notification-toast')?.textContent).toContain(
      'Rest complete',
    );
  });

  it('removes only a rest, offers Undo, persists removal and restores it only on a saved edit', async () => {
    vi.useFakeTimers();
    writeActiveWorkoutDraft(storedDraft());
    await mount();
    expect(restControl()?.value).toBe('180');
    expect(container.querySelector('.rest-between button')).toBeNull();
    await choose('Rest after set 1', '0');
    expect(restControl()).toBeNull();
    expect(container.querySelector('.undo-toast')?.textContent).toContain('Rest time removed');
    expect(container.querySelectorAll('.set-details')).toHaveLength(2);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.undo-toast-action')!.click(),
    );
    expect(restControl()?.value).toBe('180');
    await choose('Rest after set 1', '0');
    expect(restControl()).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(container.querySelector('.undo-toast')).toBeNull();
    expect(readActiveWorkoutDraft()?.movements[0].sets[0].rest_seconds).toBeNull();
    // Reload the app to prove no default rest row is recreated from the saved draft.
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount();
    expect(restControl()).toBeNull();
    await click('Options for set 1');
    const edit = [
      ...container.querySelectorAll<HTMLButtonElement>('.set-actions-menu-popover button'),
    ].find((button) => button.textContent?.includes('Edit set'))!;
    await act(async () => edit.click());
    expect(
      container.querySelector<HTMLSelectElement>('[aria-label="Rest time for set 1"]')?.value,
    ).toBe('0');
    await click('Done editing set 1');
    expect(restControl()).toBeNull();
    expect(readActiveWorkoutDraft()?.movements[0].sets[0].rest_seconds).toBeNull();
    await click('Options for set 1');
    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>('.set-actions-menu-popover button')]
        .find((button) => button.textContent?.includes('Edit set'))!
        .click(),
    );
    await choose('Rest time for set 1', '30');
    expect(restControl()).toBeNull();
    await click('Done editing set 1');
    expect(restControl()?.value).toBe('30');
    expect(container.querySelector('[role="timer"]')).toBeNull();
    await click('Options for set 1');
    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>('.set-actions-menu-popover button')]
        .find((button) => button.textContent?.includes('Edit set'))!
        .click(),
    );
    await choose('Rest time for set 1', '0');
    await click('Done editing set 1');
    expect(restControl()).toBeNull();
    expect(container.querySelector('.undo-toast')?.textContent).toContain('Rest time removed');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.undo-toast-action')!.click(),
    );
    expect(restControl()?.value).toBe('30');
  });

  it('logs a set with no rest without starting a timer or restoring the removed rest', async () => {
    const draft = storedDraft();
    draft.movements[0].sets[0].completed = false;
    draft.movements[0].sets[0].rest_seconds = null;
    writeActiveWorkoutDraft(draft);
    await mount();
    expect(
      container.querySelector<HTMLSelectElement>('[aria-label="Rest time for set 1"]')?.value,
    ).toBe('0');
    await click('Complete set 1');
    expect(restControl()).toBeNull();
    expect(container.querySelector('[role="timer"]')).toBeNull();
    const savedSet = readActiveWorkoutDraft()?.movements[0].sets[0];
    expect(savedSet?.rest_seconds).toBeNull();
    expect(savedSet?.completed).toBe(true);
  });

  it('hides rest rows without removing saved durations or disabling the countdown', async () => {
    window.localStorage.setItem('gym-logger-show-rest-times', 'disabled');
    const draft = storedDraft();
    draft.movements[0].sets[0].completed = false;
    writeActiveWorkoutDraft(draft);
    await mount();
    expect(restControl()).toBeNull();
    await click('Complete set 1');
    expect(container.querySelector('[role="timer"]')).not.toBeNull();
    expect(readActiveWorkoutDraft()?.movements[0].sets[0].rest_seconds).toBe(180);
  });

  it('keeps cancelled swipes and removes rest with a completed touch swipe and Undo', async () => {
    vi.useFakeTimers();
    writeActiveWorkoutDraft(storedDraft());
    await mount();
    const shell = restControl()!.closest<HTMLElement>('.set-swipe-shell')!;
    shell.setPointerCapture = vi.fn();
    shell.hasPointerCapture = vi.fn().mockReturnValue(false);
    async function swipe(x: number, y = 0) {
      await act(async () => {
        for (const [type, clientX, clientY] of [
          ['pointerdown', 220, 10],
          ['pointermove', 220 + x, 10 + y],
          ['pointerup', 220 + x, 10 + y],
        ] as const) {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.assign(event, {
            pointerId: 1,
            isPrimary: true,
            pointerType: 'touch',
            clientX,
            clientY,
          });
          shell.dispatchEvent(event);
        }
      });
      await act(async () => vi.advanceTimersByTimeAsync(300));
    }
    await swipe(-30);
    expect(restControl()).not.toBeNull();
    await swipe(-120, 180);
    expect(restControl()).not.toBeNull();
    await swipe(-160);
    expect(restControl()).toBeNull();
    expect(container.querySelectorAll('.set-details')).toHaveLength(2);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.undo-toast-action')!.click(),
    );
    expect(restControl()?.value).toBe('180');
  });
});

describe('active workout recovery at startup', () => {
  it('flushes the live draft before an update and blocks refresh if device storage fails', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    await mount();
    const refresh = new Event(BEFORE_APP_REFRESH_EVENT, { cancelable: true });
    expect(window.dispatchEvent(refresh)).toBe(true);
    expectPreserved(draft);
    const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('device storage is full');
    });
    const blocked = new Event(BEFORE_APP_REFRESH_EVENT, { cancelable: true });
    expect(window.dispatchEvent(blocked)).toBe(false);
    expectPreserved(draft);
    save.mockRestore();
    expect(window.dispatchEvent(new Event(BEFORE_APP_REFRESH_EVENT, { cancelable: true }))).toBe(
      true,
    );
  });

  it('restores every movement, set and note before the first draft write on a normal reload', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    await mount();
    expect(container.textContent).toContain('Bench press');
    expect(container.textContent).toContain('Cable row');
    expectPreserved(draft);
  });

  it('keeps the original draft while the catalogue request is delayed, then restores it', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    let resolveCatalogue!: (exercises: Exercise[]) => void;
    vi.mocked(api.listExercises).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCatalogue = resolve;
      }),
    );
    await mount();
    expect(container.querySelector('.workout-movements')).toBeNull();
    expect(readActiveWorkoutDraft()).toEqual(draft);
    await act(async () => resolveCatalogue([bench, row]));
    expect(container.textContent).toContain('Cable row');
    expectPreserved(draft);
  });

  it('preserves a failed startup draft and restores it through the retry control', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    vi.mocked(api.listExercises).mockRejectedValueOnce(new Error('Catalogue unavailable'));
    await mount();
    expect(container.textContent).toContain('Your saved workout is safe on this device');
    expect(container.textContent).toContain('Catalogue unavailable');
    expect(readActiveWorkoutDraft()).toEqual(draft);
    await act(async () => retry());
    expect(container.textContent).toContain('Bench press');
    expect(container.textContent).toContain('Cable row');
    expectPreserved(draft);
  });

  it('never writes a partial workout when one saved exercise is missing from the catalogue', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    vi.mocked(api.listExercises).mockResolvedValueOnce([bench]);
    await mount();
    expect(container.textContent).toContain(
      'Some exercises in your saved workout are not available',
    );
    expect(readActiveWorkoutDraft()).toEqual(draft);
    await act(async () => retry());
    expect(container.textContent).toContain('Cable row');
    expectPreserved(draft);
  });
});

describe('phantom workout prevention', () => {
  beforeEach(() => {
    vi.mocked(api.createWorkout).mockReset();
  });

  function expectNoActiveWorkout() {
    expect(readActiveWorkoutDraft()).toBeNull();
    expect(container.querySelector('.logger-screen')).toBeNull();
    expect(container.querySelector('[aria-label="Resume active workout"]')).toBeNull();
    expect(container.querySelector('[aria-label="Start workout"]')).not.toBeNull();
  }

  it('does not start a workout from an old logger link, including after eight hours and background events', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await mount();
    expect(window.location.hash).toBe('#dashboard');
    expectNoActiveWorkout();

    vi.setSystemTime(Date.now() + 8 * 60 * 60 * 1000);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
    });
    expectNoActiveWorkout();
    expect(api.createWorkout).not.toHaveBeenCalled();
    expect(api.updateWorkout).not.toHaveBeenCalled();
  });

  it('does not recreate a workout when browser history returns to the logger after a successful save', async () => {
    writeActiveWorkoutDraft(storedDraft());
    vi.mocked(api.createWorkout).mockResolvedValueOnce(remoteWorkout());
    await mount();
    await confirmFinish();
    expect(api.createWorkout).toHaveBeenCalledOnce();
    expectNoActiveWorkout();

    await act(async () => restoreOldLoggerLocation());
    expect(window.location.hash).toBe('#dashboard');
    await act(async () => window.dispatchEvent(new Event('pagehide')));
    expectNoActiveWorkout();
    expect(api.createWorkout).toHaveBeenCalledOnce();
  });

  it('closes the original logger without replacing it when a save succeeds after returning to the logger', async () => {
    writeActiveWorkoutDraft(storedDraft());
    let finishSave!: (workout: TrackedWorkout) => void;
    vi.mocked(api.createWorkout).mockReturnValueOnce(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    await mount();
    await confirmFinish();
    expect(window.location.hash).toBe('#dashboard');
    await act(async () => restoreOldLoggerLocation());
    expect(window.location.hash).toBe('#log');
    expect(readActiveWorkoutDraft()).not.toBeNull();

    await act(async () => finishSave(remoteWorkout()));
    expect(window.location.hash).toBe('#dashboard');
    await act(async () => window.dispatchEvent(new Event('pagehide')));
    expectNoActiveWorkout();
    expect(api.createWorkout).toHaveBeenCalledOnce();
  });

  it.each(['clears', 'replaces'] as const)(
    'stops a stale logger when another tab %s its draft, before background handlers can rewrite or auto-save it',
    async (change) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.mocked(api.createWorkout).mockResolvedValue(remoteWorkout());
      const original = storedDraft();
      writeActiveWorkoutDraft(original);
      await mount();
      const oldValue = window.localStorage.getItem(ACTIVE_WORKOUT_DRAFT_KEY);
      vi.setSystemTime(Date.now() + 8 * 60 * 60 * 1000);
      const replacement = storedDraft({
        startedAt: Date.now(),
        updatedAt: Date.now(),
        lastActiveAt: Date.now(),
        inactiveFinishAt: Date.now() + 3 * 60 * 60 * 1000,
        name: 'Workout started in the other tab',
        notes: 'New session must survive the stale tab',
      });
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

      await act(async () => {
        if (change === 'clears') window.localStorage.removeItem(ACTIVE_WORKOUT_DRAFT_KEY);
        else writeActiveWorkoutDraft(replacement);
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: ACTIVE_WORKOUT_DRAFT_KEY,
            oldValue,
            newValue: window.localStorage.getItem(ACTIVE_WORKOUT_DRAFT_KEY),
            storageArea: window.localStorage,
          }),
        );
        // These events run before React commits the storage listener's state update.
        window.dispatchEvent(new Event('pagehide'));
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
      });

      if (change === 'clears') expectNoActiveWorkout();
      else expect(readActiveWorkoutDraft()).toMatchObject(replacement);
      expect(api.createWorkout).not.toHaveBeenCalled();
      expect(api.updateWorkout).not.toHaveBeenCalled();
    },
  );

  it('keeps one client session identity across a failed save, reload and retry', async () => {
    writeActiveWorkoutDraft(storedDraft());
    vi.mocked(api.createWorkout).mockRejectedValueOnce(new Error('Connection lost.'));
    await mount();
    const clientSessionId = readActiveWorkoutDraft()?.clientSessionId;
    expect(clientSessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    await confirmFinish();
    expect(vi.mocked(api.createWorkout).mock.calls[0][0].client_session_id).toBe(clientSessionId);
    expect(readActiveWorkoutDraft()?.clientSessionId).toBe(clientSessionId);

    await act(async () => root.unmount());
    root = createRoot(container);
    await mount();
    expect(readActiveWorkoutDraft()?.clientSessionId).toBe(clientSessionId);
    vi.mocked(api.createWorkout).mockResolvedValueOnce(remoteWorkout());
    await confirmFinish();
    expect(api.createWorkout).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.createWorkout).mock.calls[1][0].client_session_id).toBe(clientSessionId);
    expectNoActiveWorkout();
  });
});

describe('finishing workouts in the background', () => {
  it.each([false, true])(
    'keeps a 23:30–00:30 workout on its start day (restored after midnight: %s)',
    async (restoreAfterMidnight) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const startedAt = new Date(2026, 9, 27, 23, 30).getTime();
      const endedAt = new Date(2026, 9, 28, 0, 30).getTime();
      vi.setSystemTime(startedAt);
      const draft = storedDraft({
        startedAt,
        updatedAt: startedAt,
        lastActiveAt: startedAt,
        inactiveFinishAt: startedAt + 3 * 60 * 60 * 1000,
        workoutDate: '2026-10-27',
      });
      writeActiveWorkoutDraft(draft);
      vi.mocked(api.createWorkout).mockImplementationOnce(async (payload) => ({
        ...payload,
        id: 'overnight-workout',
        movements: [],
        is_sample: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      if (restoreAfterMidnight) vi.setSystemTime(endedAt);
      await mount();
      if (!restoreAfterMidnight) vi.setSystemTime(endedAt);
      await confirmFinish();
      expect(api.createWorkout).toHaveBeenCalledOnce();
      expect(vi.mocked(api.createWorkout).mock.calls[0][0]).toMatchObject({
        workout_date: '2026-10-27',
        duration_minutes: 60,
      });
    },
  );

  it('returns to Today before the server responds, preserves recovery, and does not interrupt later navigation', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    let finishSave!: (workout: TrackedWorkout) => void;
    vi.mocked(api.createWorkout).mockReturnValueOnce(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    await mount();
    await confirmFinish();
    expect(api.createWorkout).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('#dashboard');
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Saving workout"]')?.disabled,
    ).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('.live-workout-card')?.disabled).toBe(true);
    expect(container.querySelector('.live-workout-card')?.textContent).toContain(
      'Workout finished',
    );
    expect(container.querySelector('.background-activity-bar')?.textContent).toContain(
      'Saving workout',
    );
    expectPreserved(draft);
    expect(window.dispatchEvent(new Event(BEFORE_APP_REFRESH_EVENT, { cancelable: true }))).toBe(
      false,
    );

    const history =
      container.querySelector<HTMLButtonElement>('[data-tab="history"]') ??
      [...container.querySelectorAll('button')].find(
        (button) => button.textContent === 'Training',
      )!;
    await act(async () => history.click());
    expect(window.location.hash).toBe('#training');
    await act(async () =>
      finishSave({
        ...vi.mocked(api.createWorkout).mock.calls[0][0],
        id: 'finished-workout',
        movements: [],
        is_sample: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    );
    expect(window.location.hash).toBe('#training');
    expect(readActiveWorkoutDraft()).toBeNull();
    expect(container.querySelector('.background-activity-bar')).toBeNull();
  });

  it('recovers the logger and all draft data after a failed background save, allowing a retry', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    let failSave!: (error: Error) => void;
    vi.mocked(api.createWorkout).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        failSave = reject;
      }),
    );
    await mount();
    await confirmFinish();
    expect(window.location.hash).toBe('#dashboard');
    await act(async () => failSave(new Error('Server unavailable; try again.')));
    expect(window.location.hash).toBe('#log');
    expect(container.textContent).toContain('Server unavailable; try again.');
    expectPreserved(draft);
    expect(container.querySelector('.background-activity-bar')).toBeNull();
    vi.mocked(api.createWorkout).mockReturnValueOnce(new Promise(() => {}));
    await confirmFinish();
    expect(api.createWorkout).toHaveBeenCalledTimes(2);
    expect(window.location.hash).toBe('#dashboard');
  });

  it('keeps later navigation after a failed new-workout save and preserves recovery', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    let fail!: (reason: Error) => void;
    vi.mocked(api.createWorkout).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    await mount();
    await confirmFinish();
    await navigateTo('Training');
    await act(async () => fail(new Error('Connection lost.')));
    expect(window.location.hash).toBe('#training');
    expectPreserved(draft);
    expect(document.querySelector('.app-notification-toast')?.textContent).toContain(
      'could not be saved',
    );
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
  });

  it('shows completion records without locking navigation, scrolling, or focus', async () => {
    writeActiveWorkoutDraft(storedDraft());
    vi.mocked(api.createWorkout).mockResolvedValue(remoteWorkout());
    await mount();
    vi.mocked(api.listPersonalRecords).mockResolvedValueOnce([
      {
        id: 'record',
        exercise_id: bench.id,
        exercise_name: bench.name,
        workout_id: 'remote-workout',
        set_id: 'remote-set',
        record_type: 'weight',
        value: 90,
        weight_kg: 90,
        unit: 'kg',
        normalized_weight: 90,
        formula: null,
        achieved_date: '2026-10-23',
      } as import('./types').PersonalRecord,
    ]);
    await confirmFinish();
    expect(document.querySelector('.workout-completion-toast')?.textContent).toContain('1 new PR');
    expect(document.querySelector('[aria-modal="true"], #root[inert]')).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');
    await navigateTo('Training');
    expect(window.location.hash).toBe('#training');
    expect(document.querySelector('.workout-completion-toast')).not.toBeNull();
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Close personal record summary"]')!
        .click(),
    );
    expect(document.querySelector('.workout-completion-toast')).toBeNull();
  });
});

describe('cardio set editing defaults', () => {
  it('shows a personal-zone text result after saving cardio inside a workout', async () => {
    const saved = remoteWorkout();
    saved.movements[0].exercise = { ...bench, kind: 'cardio' };
    vi.spyOn(api, 'cardioOverview').mockResolvedValue({
      cardio_preferences: {
        heart_rate_zones: [{ zone: 2, min_bpm: 110, max_bpm: 139 }],
        goals: [{ zone: 2, minutes: 150 }],
      },
      sessions: [
        {
          source_workout_id: saved.id,
          zone: 'Zone 2',
          average_heart_rate_bpm: 120,
          duration_minutes: 30,
        },
      ],
    } as import('./types').CardioOverview);
    vi.mocked(api.createWorkout).mockResolvedValue(saved);
    writeActiveWorkoutDraft(storedDraft());
    await mount();
    await confirmFinish();
    expect(document.querySelector('.app-notification-toast')?.textContent).toContain(
      'Zone 2 · 120 bpm average (110–139 bpm). 30 min added to your Zone 2 goal.',
    );
    expect(document.querySelector('.app-notification-toast svg')).toBeNull();
  });

  const treadmill: Exercise = {
    ...bench,
    id: 'treadmill',
    name: 'Incline Treadmill Walking',
    kind: 'cardio',
    category: 'cardio',
    equipment: 'Treadmill',
  };

  it.each([treadmill, bench])(
    'starts $kind suggestions with the expected editor and preserves uncompleted values',
    async (exercise) => {
      window.history.replaceState(null, '', '#dashboard');
      const saved = remoteWorkout();
      saved.category = exercise.category;
      vi.mocked(api.dashboard).mockResolvedValue({
        recommendation: { category: exercise.category, rotation_next: exercise.category },
      } as unknown as DashboardData);
      saved.movements[0].exercise = exercise;
      Object.assign(saved.movements[0].sets[0], {
        duration_seconds: 3120,
        distance_km: 4.06,
        calories_kcal: 613,
        average_heart_rate_bpm: 133,
        speed_kph: 4.7,
        incline_percent: 15,
      });
      vi.mocked(api.listExercises).mockResolvedValue([exercise]);
      vi.mocked(api.listWorkouts).mockResolvedValue([saved]);
      await mount();
      await act(async () => container.querySelector<HTMLButtonElement>('.app-tab-start')!.click());
      const option = [...container.querySelectorAll<HTMLButtonElement>('.start-menu-option')].find(
        (button) => button.textContent?.includes(exercise.kind === 'cardio' ? 'Cardio' : 'Up next'),
      )!;
      await act(async () => option.click());

      const isCardio = exercise.kind === 'cardio';
      expect(container.querySelector('.set-details')?.getAttribute('data-expanded')).toBe(
        String(isCardio),
      );
      const set = readActiveWorkoutDraft()!.movements[0].sets[0];
      expect(set).toMatchObject({ completed: false, fromPrevious: true });
      if (isCardio) {
        expect(
          container.querySelector<HTMLInputElement>('[aria-label="Duration minutes"]')!.value,
        ).toBe('52');
        expect(
          container.querySelector<HTMLInputElement>('[aria-label="Distance kilometres"]')!.value,
        ).toBe('4.06');
        expect(
          container.querySelector('[aria-label="Upload cardio set screenshot"]'),
        ).not.toBeNull();
        expect(set).toMatchObject({ duration_seconds: 3120, distance_km: 4.06 });
      }
      expect(container.querySelector('.workout-summary-metrics')?.textContent).toContain('Sets0');
      expect(api.createWorkout).not.toHaveBeenCalled();
    },
  );

  it('folds a completed cardio set and reopens it when unticked, including after recovery', async () => {
    const draft = storedDraft({ category: 'cardio' });
    draft.movements = [
      {
        ...draft.movements[0],
        exerciseId: treadmill.id,
        machinePhotoIds: [],
        supersetKey: null,
        sets: [
          {
            ...createWorkoutSet('cardio'),
            key: 'cardio-set',
            duration_seconds: 3120,
            distance_km: 4.06,
            completed: false,
            fromPrevious: true,
          },
        ],
      },
    ];
    vi.mocked(api.listExercises).mockResolvedValue([treadmill]);
    writeActiveWorkoutDraft(draft);
    await mount();
    const expanded = () => container.querySelector('.set-details')?.getAttribute('data-expanded');
    const tick = () => container.querySelector<HTMLButtonElement>('.row-complete-button')!;
    expect(expanded()).toBe('true');
    expect(tick().getAttribute('aria-pressed')).toBe('false');
    await act(async () => tick().click());
    expect(expanded()).toBe('false');
    expect(readActiveWorkoutDraft()!.movements[0].sets[0].completed).toBe(true);

    await act(async () => root.unmount());
    root = createRoot(container);
    await mount();
    expect(expanded()).toBe('false');
    await act(async () => tick().click());
    expect(expanded()).toBe('true');
    expect(readActiveWorkoutDraft()!.movements[0].sets[0].completed).toBe(false);
  });
});

describe('inactive workout suggestions', () => {
  function expiredSuggestions(completedFirst: boolean) {
    const draft = storedDraft();
    draft.startedAt = Date.now() - 3 * 60 * 60 * 1000 - 1000;
    draft.lastActiveAt = draft.startedAt;
    draft.updatedAt = draft.startedAt;
    draft.inactiveFinishAt = Date.now() - 1000;
    draft.movements = [
      {
        ...draft.movements[0],
        sets: [0, 1, 2].map((index) => ({
          ...draft.movements[0].sets[0],
          key: `set-${index}`,
          weight_kg: index === 0 ? 80 : 160,
          completed: completedFirst && index === 0,
          fromPrevious: !(completedFirst && index === 0),
        })),
      },
    ];
    return draft;
  }

  it('does not create a timed-out workout from untouched suggestions', async () => {
    const draft = expiredSuggestions(false);
    writeActiveWorkoutDraft(draft);
    await mount();
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(api.createWorkout).not.toHaveBeenCalled();
    expect(readActiveWorkoutDraft()?.movements).toEqual(draft.movements);
    expect(container.querySelector('.workout-summary-metrics')?.textContent).toContain(
      'Sets0Reps0',
    );
    expect(container.querySelectorAll('.pr-badge')).toHaveLength(0);
  });

  it('does not turn planned sets into performed sets when rest is edited', async () => {
    const draft = expiredSuggestions(false);
    writeActiveWorkoutDraft(draft);
    await mount();
    const rest = container.querySelector<HTMLSelectElement>('[aria-label="Rest after set 1"]')!;
    await act(async () => {
      rest.value = '120';
      rest.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const set = readActiveWorkoutDraft()!.movements[0].sets[0];
    expect(set.rest_seconds).toBe(120);
    expect(set.fromPrevious).toBe(true);
    expect(set.completed).toBe(false);
    expect(api.createWorkout).not.toHaveBeenCalled();
  });

  it('saves exactly one completed set alongside untouched suggestions at timeout', async () => {
    const draft = expiredSuggestions(true);
    writeActiveWorkoutDraft(draft);
    // Keep the response pending so the assertion observes the actual autosave payload.
    vi.mocked(api.createWorkout).mockReturnValueOnce(new Promise<TrackedWorkout>(() => {}));
    await mount();
    expect(api.createWorkout).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('#dashboard');
    // An update cannot reload while the server save is still awaiting its response.
    expect(window.dispatchEvent(new Event(BEFORE_APP_REFRESH_EVENT, { cancelable: true }))).toBe(
      false,
    );
    const payload = vi.mocked(api.createWorkout).mock.calls[0][0] as WorkoutInput;
    const sets = payload.movements.flatMap((movement) => movement.sets);
    expect(sets.map((set) => set.completed)).toEqual([true, false, false]);
    const completed = sets.filter((set) => set.completed);
    expect(completed).toHaveLength(1);
    expect(completed.reduce((volume, set) => volume + set.reps! * set.weight_kg!, 0)).toBe(640);
    expect(sets.filter(isStrengthPrEligible)).toHaveLength(1);
    expect(sets[1].weight_kg).toBe(160);
    expect(sets[2].weight_kg).toBe(160);
  });

  it('does not auto-complete an untouched extra set copied with Add set', async () => {
    const draft = storedDraft();
    draft.movements = [draft.movements[0]];
    writeActiveWorkoutDraft(draft);
    await mount();
    const addSet = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Add set'),
    )!;
    await act(async () => addSet.click());
    expect(readActiveWorkoutDraft()!.movements[0].sets[1].fromPrevious).toBe(true);
    vi.mocked(api.createWorkout).mockReturnValueOnce(new Promise<TrackedWorkout>(() => {}));
    vi.spyOn(Date, 'now').mockReturnValue(draft.inactiveFinishAt! + 1000);
    await act(async () => window.dispatchEvent(new Event('focus')));
    const payload = vi.mocked(api.createWorkout).mock.calls[0][0] as WorkoutInput;
    expect(payload.movements[0].sets.map((set) => set.completed)).toEqual([true, false]);
  });

  it('keeps saved incomplete suggestions unchecked after History resume and timeout', async () => {
    window.history.replaceState(null, '', '#history');
    const saved: TrackedWorkout = {
      id: 'saved-workout',
      name: 'Workout with planned sets',
      workout_date: '2026-10-13',
      category: 'push',
      notes: 'Workout notes survive',
      duration_minutes: 45,
      start_time: null,
      end_time: null,
      is_sample: false,
      created_at: '2026-10-13T01:00:00Z',
      updated_at: '2026-10-13T01:00:00Z',
      movements: [
        {
          id: 'saved-movement',
          order_index: 0,
          exercise: bench,
          notes: 'Movement notes survive',
          machine_photos: [],
          superset_group_id: null,
          superset_name: null,
          sets: [0, 1, 2].map((index) => ({
            id: `saved-set-${index}`,
            order_index: index,
            reps: 8,
            weight_kg: index === 0 ? 80 : 160,
            rpe: 8,
            rest_seconds: 180,
            duration_seconds: null,
            distance_km: null,
            incline_percent: null,
            speed_kph: null,
            bodyweight_kg: null,
            percentile: null,
            warmup: false,
            set_type: 'normal',
            failed: false,
            target_reps: null,
            notes: `Saved set ${index}`,
            completed: index === 0,
          })),
        },
      ],
    };
    vi.mocked(api.listWorkouts).mockResolvedValue([saved]);
    vi.mocked(api.updateWorkout).mockReturnValueOnce(new Promise<TrackedWorkout>(() => {}));
    await mount();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.history-card-summary')!.click(),
    );
    const resume = container.querySelector<HTMLButtonElement>('.resume-workout-button')!;
    expect(resume.textContent).toBe('Resume from now');
    await act(async () => resume.click());
    const resumed = readActiveWorkoutDraft()!;
    expect(resumed.resumingWorkoutId).toBe(saved.id);
    expect(resumed.movements[0].sets.map((set) => set.completed)).toEqual([true, false, false]);
    expect(resumed.movements[0].sets.map((set) => set.fromPrevious)).toEqual([false, true, true]);
    vi.spyOn(Date, 'now').mockReturnValue(resumed.inactiveFinishAt! + 1000);
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(api.updateWorkout).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('#dashboard');
    expect(api.createWorkout).not.toHaveBeenCalled();
    const [id, payload] = vi.mocked(api.updateWorkout).mock.calls[0];
    expect(id).toBe(saved.id);
    const sets = payload.movements[0].sets;
    expect(sets.map((set) => set.completed)).toEqual([true, false, false]);
    expect(sets.filter(isStrengthPrEligible)).toHaveLength(1);
    expect(
      sets
        .filter((set) => set.completed)
        .reduce((volume, set) => volume + set.reps! * set.weight_kg!, 0),
    ).toBe(640);
    expect(sets.map((set) => set.notes)).toEqual(saved.movements[0].sets.map((set) => set.notes));
  });
});

function remoteWorkout(name = 'Phone workout'): TrackedWorkout {
  return {
    id: 'remote-workout',
    name,
    workout_date: '2026-10-23',
    category: 'push',
    notes: null,
    duration_minutes: 30,
    start_time: null,
    end_time: null,
    is_sample: true,
    created_at: '2026-10-23T01:00:00Z',
    updated_at: '2026-10-23T01:00:00Z',
    movements: [
      {
        id: 'remote-movement',
        order_index: 0,
        exercise: bench,
        notes: null,
        machine_photos: [],
        superset_group_id: null,
        superset_name: null,
        sets: [
          {
            ...createWorkoutSet('strength'),
            id: 'remote-set',
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
}
async function navigateTo(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('nav button')].find(
    (button) => button.textContent?.trim() === label,
  )!;
  expect(button).toBeDefined();
  await act(async () => button.click());
}
async function focusApp() {
  await act(async () => window.dispatchEvent(new Event('focus')));
}
describe('cross-device training updates', () => {
  beforeEach(() => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    window.history.replaceState(null, '', '#training');
  });
  it('reconciles remote creates, edits and deletes without reloading or navigating', async () => {
    await mount();
    await focusApp();
    expect(api.listWorkouts).toHaveBeenCalledTimes(1);
    for (const [revision, remote] of [
      ['created', [remoteWorkout()]],
      ['edited', [remoteWorkout('Updated phone workout')]],
      ['deleted', []],
    ] as const) {
      vi.mocked(api.workoutRevision).mockResolvedValue({ revision });
      vi.mocked(api.listWorkouts).mockResolvedValue([...remote]);
      await focusApp();
      expect(window.location.hash).toBe('#training');
      expect(container.querySelectorAll('.history-card')).toHaveLength(remote.length);
      if (remote.length)
        expect(container.querySelector('.history-card')?.textContent).toContain(remote[0].name);
      expect(container.querySelector('.background-activity-bar')).toBeNull();
      expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    }
    expect(api.listWorkouts).toHaveBeenCalledTimes(4);
    await focusApp();
    expect(api.listWorkouts).toHaveBeenCalledTimes(4);
  });
  it('preserves an active workout and its notes/sets while remote history changes', async () => {
    window.history.replaceState(null, '', '#log');
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    await mount();
    vi.mocked(api.workoutRevision).mockResolvedValue({ revision: 'remote' });
    vi.mocked(api.listWorkouts).mockResolvedValue([remoteWorkout()]);
    await focusApp();
    expect(window.location.hash).toBe('#log');
    expectPreserved(draft);
    expect(container.querySelector('.logger-screen')?.textContent).toContain(
      'Workout notes survive',
    );
  });
  it('retries an incomplete refresh rather than acknowledging missing data', async () => {
    await mount();
    vi.mocked(api.workoutRevision).mockResolvedValue({ revision: 'changed' });
    vi.mocked(api.listWorkouts).mockRejectedValueOnce(new Error('temporary outage'));
    await focusApp();
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    vi.mocked(api.listWorkouts).mockResolvedValue([remoteWorkout()]);
    await focusApp();
    expect(container.querySelector('.history-card')?.textContent).toContain('Phone workout');
    expect(api.listWorkouts).toHaveBeenCalledTimes(3);
  });
  it('rechecks a change made during a refresh on the next check', async () => {
    await mount();
    let deliver!: (workouts: TrackedWorkout[]) => void;
    vi.mocked(api.workoutRevision).mockResolvedValue({ revision: 'first-change' });
    vi.mocked(api.listWorkouts).mockReturnValueOnce(
      new Promise((resolve) => {
        deliver = resolve;
      }),
    );
    await focusApp();
    vi.mocked(api.workoutRevision).mockResolvedValue({ revision: 'second-change' });
    await act(async () => deliver([remoteWorkout()]));
    vi.mocked(api.listWorkouts).mockResolvedValue([remoteWorkout('Latest phone change')]);
    await focusApp();
    expect(container.querySelector('.history-card')?.textContent).toContain('Latest phone change');
    expect(api.listWorkouts).toHaveBeenCalledTimes(3);
  });
});
describe('navigation while saving an old workout', () => {
  async function editSavedWorkout() {
    window.history.replaceState(null, '', '#training');
    vi.mocked(api.listWorkouts).mockResolvedValue([remoteWorkout()]);
    await mount();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.history-card-summary')!.click(),
    );
    const edit = [...container.querySelectorAll<HTMLButtonElement>('.workout-actions button')].find(
      (button) => button.textContent === 'Edit',
    )!;
    await act(async () => edit.click());
  }
  it('keeps later navigation when a slow edit succeeds', async () => {
    let finish!: (workout: TrackedWorkout) => void;
    vi.mocked(api.updateWorkout).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await editSavedWorkout();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.finish-workout-bottom')!.click(),
    );
    expect(api.updateWorkout).toHaveBeenCalledOnce();
    await navigateTo('Body');
    await act(async () => finish(remoteWorkout('Saved changes')));
    expect(window.location.hash).toBe('#body');
  });
  it('keeps the editor mounted for a failed edit while another screen stays usable', async () => {
    let fail!: (error: Error) => void;
    vi.mocked(api.updateWorkout).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    await editSavedWorkout();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.finish-workout-bottom')!.click(),
    );
    await navigateTo('Body');
    await act(async () => fail(new Error('Save failed; retry.')));
    expect(window.location.hash).toBe('#body');
    expect(container.querySelector('.logger-screen')?.textContent).toContain('Save failed; retry.');
    expect(document.querySelector('.app-notification-toast')?.textContent).toContain(
      'could not be saved',
    );
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    await navigateTo('Training');
    expect(window.location.hash).toBe('#training');
  });
});
