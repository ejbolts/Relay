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
import type { BodyMeasurement, DashboardData, Exercise } from './types';

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
  muscle_set_credits: [
    { muscle_name: 'Chest', sets: 1 },
    { muscle_name: 'Triceps', sets: 0.5 },
  ],
};
const TODAY = '2026-10-20';
let root: Root;
let container: HTMLDivElement;

/**
 * A live workout with one exercise and these planned weights, none ticked. Suggested sets follow
 * the weight just logged, so a test that needs different weights enters them as typed values.
 */
function liveDraft(weights: number[], exercise: Exercise = bench, suggested = true) {
  vi.mocked(api.listExercises).mockResolvedValue([exercise]);
  const startedAt = Date.now() - 60_000;
  const draft: ActiveWorkoutDraft = {
    version: 1,
    startedAt,
    updatedAt: startedAt,
    lastActiveAt: startedAt,
    inactiveFinishAt: startedAt + 3 * 60 * 60 * 1000,
    name: 'Push workout',
    workoutDate: TODAY,
    category: 'push',
    notes: '',
    movements: [
      {
        key: 'movement-0',
        exerciseId: exercise.id,
        notes: '',
        machinePhotoIds: [],
        supersetKey: null,
        isComplete: false,
        sets: weights.map((weight, index) => ({
          ...createWorkoutSet('strength'),
          key: `set-${index}`,
          reps: 8,
          weight_kg: weight,
          rest_seconds: 0,
          set_type: 'normal' as const,
          warmup: false,
          completed: false,
          fromPrevious: suggested,
        })),
      },
    ],
  };
  writeActiveWorkoutDraft(draft);
}

async function mount() {
  await act(async () => root.render(<App />));
}
const card = () => container.querySelector<HTMLElement>('.movement-card')!;
const labelled = (label: string) =>
  container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
async function click(target: HTMLElement) {
  await act(async () => target.click());
}
const collapseButton = () => card().querySelector<HTMLButtonElement>('.movement-collapse-button')!;
const tick = (set: number) => click(labelled(`Complete set ${set}`));
const shelfGains = () =>
  [...container.querySelectorAll('.weekly-shelf-cell')].map(
    (cell) =>
      `${cell.querySelector('.weekly-shelf-name')?.textContent} ${cell.querySelector('.weekly-shelf-gain')?.textContent}`,
  );
/** Each shelf total as before→after. */
const totals = () =>
  [...container.querySelectorAll('.weekly-shelf-roll > span')].map((roll) =>
    [...roll.children].map((value) => value.textContent).join('→'),
  );
const menuItems = () =>
  [...card().querySelectorAll('.movement-overflow-menu button')].map((item) =>
    item.textContent?.replace('⇄', '').trim(),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
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
  vi.mocked(api.dashboard).mockResolvedValue({
    recommendation: null,
    weekly_sets: { week_start: '2026-10-19', week_end: '2026-10-25', muscle_groups: [] },
  } as unknown as DashboardData);
  vi.mocked(api.listWorkouts).mockResolvedValue([]);
  vi.mocked(api.listBodyMeasurements).mockResolvedValue([
    {
      id: 'weigh-in',
      measurement_date: TODAY,
      weight_kg: 80,
      body_fat_pct: null,
      notes: null,
      is_sample: false,
      created_at: `${TODAY}T07:00:00Z`,
    } satisfies BodyMeasurement,
  ]);
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

describe('finishing an exercise by ticking its last set', () => {
  it('updates weekly totals with each set and keeps the finished exercise open', async () => {
    liveDraft([60, 60, 60]);
    await mount();
    await tick(1);
    // Each set moves its muscles' weekly totals as it is logged.
    expect(shelfGains()).toEqual(['Chest +1', 'Triceps +0.5']);
    expect(totals()).toEqual(['0→1', '0→0.5']);
    await tick(2);
    expect(shelfGains()).toEqual(['Chest +1', 'Triceps +0.5']);
    expect(totals()).toEqual(['1→2', '0.5→1']);
    expect(card().classList.contains('is-collapsed')).toBe(false);
    expect(readActiveWorkoutDraft()!.movements[0].isComplete).toBe(false);
    expect(collapseButton().classList.contains('is-done')).toBe(false);

    await tick(3);
    expect(readActiveWorkoutDraft()!.movements[0].isComplete).toBe(true);
    expect(shelfGains()).toEqual(['Chest +3', 'Triceps +1.5']);
    // Ticking the last set never folds the card; the button beside Add set does, once asked.
    expect(card().classList.contains('is-collapsed')).toBe(false);
    expect(collapseButton().classList.contains('is-done')).toBe(true);
    expect(collapseButton().getAttribute('aria-label')).toBe('Collapse Bench press');
    await click(collapseButton());
    expect(card().classList.contains('is-collapsed')).toBe(true);
    expect(card().querySelector('.movement-completed-summary')?.textContent).toBe(
      '3 completed sets',
    );

    await click(labelled('Expand Bench press'));
    expect(card().classList.contains('is-collapsed')).toBe(false);
  });

  it('keeps the exercise open when it is finished from its header', async () => {
    liveDraft([60, 60]);
    await mount();
    await click(labelled('Finish Bench press'));
    expect(readActiveWorkoutDraft()!.movements[0].isComplete).toBe(true);
    expect(card().classList.contains('is-collapsed')).toBe(false);
  });

  it('keeps the exercise open after ticking a set that was added by hand', async () => {
    liveDraft([60, 60]);
    await mount();
    await tick(1);
    await tick(2);
    expect(readActiveWorkoutDraft()!.movements[0].isComplete).toBe(true);

    await click(container.querySelector<HTMLButtonElement>('.add-set-button')!);
    await tick(3);
    expect(readActiveWorkoutDraft()!.movements[0].sets.map((set) => set.completed)).toEqual([
      true,
      true,
      true,
    ]);
    // Adding sets as you go: the card stays open for the next one.
    expect(readActiveWorkoutDraft()!.movements[0].isComplete).toBe(false);
    expect(card().classList.contains('is-collapsed')).toBe(false);
    expect(shelfGains()).toEqual(['Chest +3', 'Triceps +1.5']);
  });

  it('leaves an exercise with a single set open', async () => {
    liveDraft([60]);
    await mount();
    await tick(1);
    expect(readActiveWorkoutDraft()!.movements[0].isComplete).toBe(false);
    expect(card().classList.contains('is-collapsed')).toBe(false);
    expect(shelfGains()).toEqual(['Chest +1', 'Triceps +0.5']);
  });
});

describe('quieter set rows', () => {
  it('says the bodyweight ratio once, on the heaviest logged set', async () => {
    liveDraft([60, 80, 70, 70], bench, false);
    await mount();
    await tick(1);
    expect(
      [...container.querySelectorAll('.completed-set-bodyweight')].map((item) => item.textContent),
    ).toEqual(['0.75× BW · at 80 kg BW']);
    await tick(2);
    await tick(3);
    const ratios = [...container.querySelectorAll('.completed-set-bodyweight')];
    expect(ratios.map((item) => item.textContent)).toEqual(['1.00× BW · at 80 kg BW']);
    expect(ratios[0].closest('[data-set-key]')?.getAttribute('data-set-key')).toBe('set-1');
  });

  it('has no menu on a set row: Delete set sits in the open set', async () => {
    liveDraft([60, 60]);
    await mount();
    expect(container.querySelector('.completed-set-menu')).toBeNull();
    expect(container.querySelector('[aria-label="Options for set 1"]')).toBeNull();
    await click(labelled('Edit weight for set 1'));
    await click(labelled('Delete set 1'));
    expect(readActiveWorkoutDraft()!.movements[0].sets.map((set) => set.key)).toEqual(['set-1']);
  });
});

describe('exercise menu', () => {
  it('opens muscle credits from the menu instead of a button beside the name', async () => {
    liveDraft([60, 60]);
    await mount();
    expect(card().querySelector('.exercise-muscle-help-button')).toBeNull();
    expect(menuItems()).toContain('Muscle credits');
    await click(
      [...card().querySelectorAll<HTMLButtonElement>('.movement-overflow-menu button')].find(
        (item) => item.textContent?.includes('Muscle credits'),
      )!,
    );
    const dialog = document.querySelector<HTMLDialogElement>('.exercise-muscle-dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('h2')?.textContent).toBe('Bench press');
  });

  it('keeps the equipment row off free-weight exercises until it is asked for', async () => {
    liveDraft([60, 60]);
    await mount();
    expect(card().querySelector('.machine-photo-summary')).toBeNull();
    // Saved machines are still looked up, so one used before would show itself.
    expect(api.listMachinePhotos).toHaveBeenCalledWith('bench');
    expect(menuItems()).toContain('Equipment photo');
    await click(
      [...card().querySelectorAll<HTMLButtonElement>('.movement-overflow-menu button')].find(
        (item) => item.textContent?.includes('Equipment photo'),
      )!,
    );
    expect(card().querySelector<HTMLDetailsElement>('.machine-photo-picker')?.open).toBe(true);
    expect(menuItems()).not.toContain('Equipment photo');
  });

  it('shows the equipment row straight away on a machine exercise', async () => {
    liveDraft([60, 60], { ...bench, id: 'chest-press', name: 'Chest press', equipment: 'Machine' });
    await mount();
    expect(card().querySelector('.machine-photo-summary strong')?.textContent).toBe(
      'Equipment photo',
    );
    expect(menuItems()).not.toContain('Equipment photo');
  });
});
