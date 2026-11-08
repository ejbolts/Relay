// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
import { localDate } from './utils';
import { readActiveWorkoutDraft, writeActiveWorkoutDraft } from './workoutDraft';
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
      getWorkoutTypeColors: vi.fn(),
      listMachinePhotos: vi.fn().mockResolvedValue([]),
      getMachineSettings: vi.fn().mockResolvedValue({ settings: [] }),
      lastUsedMachinePhotos: vi.fn().mockResolvedValue([]),
      listAllMachinePhotos: vi.fn().mockResolvedValue([]),
      exerciseLibrary: vi.fn().mockResolvedValue([]),
    },
  };
});
vi.mock('./workoutCache', () => ({
  readDashboardCache: vi.fn().mockResolvedValue(null),
  writeDashboardCache: vi.fn().mockResolvedValue(undefined),
  readWorkoutCache: vi.fn().mockResolvedValue(null),
  writeWorkoutCache: vi.fn().mockResolvedValue(undefined),
}));

function exercise(
  id: string,
  name: string,
  equipment: string,
  credits: Record<string, number>,
): Exercise {
  return {
    id,
    name,
    category: 'push',
    kind: 'strength',
    muscle_group: Object.keys(credits)[0],
    equipment,
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
    default_muscle_set_credits: Object.entries(credits).map(([muscle_name, sets]) => ({
      muscle_name,
      sets,
    })),
  };
}

const press = { Chest: 1, 'Front delts': 0.5, Triceps: 0.5 };
const chestPress = exercise('chest-press', 'Chest press machine', 'Machine', press);
const dumbbellBench = exercise('db-bench', 'Dumbbell bench press', 'Dumbbell', press);
const pecDeck = exercise('pec-deck', 'Pec deck', 'Machine', { Chest: 1 });
const legPress = exercise('leg-press', 'Leg press', 'Machine', { Quads: 1 });

const lastBench: TrackedWorkout = {
  id: 'last-push',
  name: 'Push',
  workout_date: '2026-10-01',
  category: 'push',
  notes: null,
  duration_minutes: 45,
  start_time: null,
  end_time: null,
  is_sample: false,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
  movements: [
    {
      id: 'bench-movement',
      order_index: 0,
      notes: null,
      machine_photos: [],
      superset_group_id: null,
      superset_name: null,
      exercise: dumbbellBench,
      sets: [24, 26].map((weight, index) => ({
        id: `bench-${index}`,
        order_index: index,
        weight_kg: weight,
        reps: 10,
        rpe: null,
        rest_seconds: null,
        duration_seconds: null,
        distance_km: null,
        incline_percent: null,
        speed_kph: null,
        bodyweight_kg: null,
        percentile: null,
        warmup: false,
        set_type: 'normal' as const,
        failed: false,
        target_reps: null,
        notes: null,
        completed: true,
      })),
    },
  ],
};

let root: Root;
let container: HTMLDivElement;

function button(label: string, scope: ParentNode = document): HTMLButtonElement {
  const match = [...scope.querySelectorAll('button')].find(
    (item) =>
      item.textContent?.replace('⇄', '').trim() === label ||
      item.getAttribute('aria-label') === label,
  );
  if (!match) throw new Error(`No button labelled ${label}`);
  return match as HTMLButtonElement;
}

async function click(target: HTMLElement) {
  await act(async () => target.click());
}

function cardTitles() {
  return [...container.querySelectorAll('.movement-card .movement-history-link')].map(
    (item) => item.textContent,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  window.localStorage.clear();
  window.localStorage.setItem('gym-logger-reduce-motion', 'reduced');
  vi.mocked(api.workoutRevision).mockResolvedValue({ revision: 'initial' });
  vi.mocked(api.dashboard).mockResolvedValue({
    recommendation: null,
    heatmap: [],
  } as unknown as DashboardData);
  vi.mocked(api.listExercises).mockResolvedValue([chestPress, dumbbellBench, pecDeck, legPress]);
  vi.mocked(api.listWorkouts).mockResolvedValue([lastBench]);
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
  const startedAt = Date.now() - 600_000;
  window.history.replaceState(null, '', '#log');
  writeActiveWorkoutDraft({
    version: 1,
    startedAt,
    updatedAt: startedAt,
    lastActiveAt: startedAt,
    inactiveFinishAt: startedAt + 3 * 60 * 60 * 1000,
    name: 'Push day',
    workoutDate: localDate(),
    category: 'push',
    notes: '',
    movements: [
      {
        key: 'press',
        exerciseId: chestPress.id,
        notes: '',
        machinePhotoIds: [],
        supersetKey: null,
        isComplete: false,
        sets: [
          { reps: 10, completed: true },
          { reps: 10, completed: false },
          { reps: 8, completed: false },
        ].map((values, index) => ({
          ...createWorkoutSet('strength', undefined, false),
          key: `set-${index}`,
          weight_kg: 60,
          ...values,
        })),
      },
    ],
  });
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

describe('swapping an exercise mid-workout', () => {
  it('offers same-muscle alternatives, carries planned sets over and can be undone', async () => {
    await act(async () => root.render(<App />));
    expect(cardTitles()).toEqual([chestPress.name]);

    await click(button('Swap Exercise'));
    const sheet = document.querySelector<HTMLDialogElement>('.exercise-swap-sheet')!;
    expect(sheet.open).toBe(true);
    expect(sheet.querySelector('h2')?.textContent).toBe(`Swap ${chestPress.name}`);
    expect(sheet.querySelector('.exercise-swap-carry')?.textContent).toBe(
      '2 planned sets move across · 1 logged set stays',
    );
    const options = () =>
      [...sheet.querySelectorAll('.exercise-swap-option strong')].map((item) => item.textContent);
    // Leg press trains none of the same muscles, so it is not offered.
    expect(options()).toEqual([dumbbellBench.name, pecDeck.name]);
    expect(
      [...sheet.querySelectorAll('.exercise-swap-group')].map((item) => item.textContent),
    ).toEqual(['Same muscles', 'Close match']);

    await click(button('Dumbbell', sheet));
    expect(options()).toEqual([dumbbellBench.name]);

    const benchOption = [
      ...sheet.querySelectorAll<HTMLButtonElement>('.exercise-swap-option'),
    ].find((item) => item.querySelector('strong')?.textContent === dumbbellBench.name)!;
    expect(benchOption.querySelector('.exercise-swap-match')?.textContent).toBe(
      '100% muscle match',
    );
    await click(benchOption);
    expect(document.querySelector('.exercise-swap-sheet')).toBeNull();
    expect(cardTitles()).toEqual([chestPress.name, dumbbellBench.name]);
    expect(container.querySelector('.movement-swapped-from')?.textContent).toContain(
      `Swapped from ${chestPress.name}`,
    );
    expect(container.querySelector('.undo-toast')?.textContent).toContain(
      `Swapped to ${dumbbellBench.name}`,
    );

    const [original, replacement] = readActiveWorkoutDraft()!.movements;
    expect(original).toMatchObject({ key: 'press', exerciseId: chestPress.id, isComplete: true });
    expect(original.sets.map((set) => set.completed)).toEqual([true]);
    expect(replacement).toMatchObject({
      exerciseId: dumbbellBench.id,
      swappedFrom: chestPress.name,
    });
    expect(replacement.sets.map((set) => [set.weight_kg, set.reps, set.completed])).toEqual([
      [24, 10, false],
      [26, 8, false],
    ]);

    await click(button('Undo'));
    expect(cardTitles()).toEqual([chestPress.name]);
    expect(readActiveWorkoutDraft()!.movements[0].sets).toHaveLength(3);
    expect(container.querySelector('.movement-swapped-from')).toBeNull();
  });

  it('falls back to the full exercise picker', async () => {
    await act(async () => root.render(<App />));
    await click(button('Swap Exercise'));
    await click(button('Browse all exercises'));
    expect(document.querySelector('.exercise-swap-sheet')).toBeNull();
    expect(document.querySelector('.exercise-option[data-exercise-id="leg-press"]')).not.toBeNull();
  });
});
