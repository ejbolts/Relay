// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';
import { readActiveWorkoutDraft } from './workoutDraft';
import {
  readDashboardCache,
  readWorkoutCache,
  writeDashboardCache,
  writeWorkoutCache,
} from './workoutCache';
import type { DashboardData, Exercise } from './types';

vi.mock('./workoutCache', () => ({
  readDashboardCache: vi.fn().mockResolvedValue(null),
  writeDashboardCache: vi.fn().mockResolvedValue(undefined),
  readWorkoutCache: vi.fn().mockResolvedValue(null),
  writeWorkoutCache: vi.fn().mockResolvedValue(undefined),
}));

const press: Exercise = {
  id: 'press',
  name: 'Sample press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Pectorals',
  equipment: 'Machine',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
  muscle_set_credits: [
    { muscle_name: 'Pectorals', sets: 1 },
    { muscle_name: 'Triceps', sets: 0.5 },
  ],
};
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.mocked(readDashboardCache).mockResolvedValue(null);
  vi.mocked(readWorkoutCache).mockResolvedValue(null);
  vi.mocked(writeDashboardCache).mockResolvedValue(undefined);
  vi.mocked(writeWorkoutCache).mockResolvedValue(undefined);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  window.localStorage.clear();
  window.localStorage.setItem('gym-logger-reduce-motion', 'reduced');
  vi.spyOn(api, 'workoutRevision').mockResolvedValue({ revision: 'initial' });
  vi.spyOn(api, 'dashboard').mockResolvedValue({
    recommendation: null,
    heatmap: [],
  } as unknown as DashboardData);
  vi.spyOn(api, 'listExercises').mockResolvedValue([press]);
  vi.spyOn(api, 'listWorkouts').mockResolvedValue([]);
  vi.spyOn(api, 'listBodyMeasurements').mockResolvedValue([]);
  vi.spyOn(api, 'listPersonalRecords').mockResolvedValue([]);
  vi.spyOn(api, 'getWorkoutTypes').mockResolvedValue(DEFAULT_WORKOUT_TYPES);
  vi.spyOn(api, 'getWorkoutTypeColors').mockResolvedValue({
    upper: '#8b5cf6',
    lower: '#f59e0b',
    push: '#ef476f',
    pull: '#3b82f6',
    full_body: '#14b8a6',
    cardio: '#22c55e',
    other: '#94a3b8',
  });
  vi.spyOn(api, 'getTrainingPreferences').mockResolvedValue({
    preferred_weight_unit: 'kg',
    week_start: 'monday',
    zone2_goal_minutes: 150,
    weekly_muscle_set_goal: 10,
  });
  vi.spyOn(api, 'exerciseLibrary').mockResolvedValue([]);
  vi.spyOn(api, 'createExercise').mockImplementation(async (input) => ({
    ...press,
    ...input,
    id: 'custom',
    is_custom: true,
  }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(section: 'history' | 'progress') {
  window.history.replaceState(null, '', `#${section}`);
  await act(async () => root.render(<App />));
}

async function click(element: Element) {
  await act(async () => (element as HTMLElement).click());
}

async function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLInputElement ? 'input' : 'change', { bubbles: true }),
    );
  });
}

it.each(['history', 'progress'] as const)(
  'creates an exercise from %s without starting a workout',
  async (section) => {
    await render(section);
    expect(host.querySelector('.training-exercise-actions')).toBeNull();
    const shortcut = host.querySelector(
      section === 'history'
        ? '.page-header-title-row [aria-label="Add exercise"]'
        : '.exercise-list-toolbar [aria-label="Add exercise"]',
    )!;
    expect(shortcut).not.toBeNull();
    await click(shortcut);
    const dialog = document.querySelector<HTMLDialogElement>('.create-exercise-dialog')!;
    expect(dialog.open).toBe(true);
    await setValue(dialog.querySelector('input[placeholder="Exercise name"]')!, 'Custom press');
    await setValue(dialog.querySelector('select')!, 'push');
    await setValue(dialog.querySelector('[aria-label="Target muscle 1"]')!, 'Pectorals');
    await click(
      [...dialog.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Add muscle'),
      )!,
    );
    await setValue(dialog.querySelector('[aria-label="Target muscle 2"]')!, 'Triceps');
    await setValue(dialog.querySelector('[aria-label="Credit per working set 2"]')!, '0.5');
    await click(dialog.querySelector('button[type="submit"]')!);
    expect(api.createExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Custom press',
        muscle_set_credits: [
          { muscle_name: 'Pectorals', sets: 1 },
          { muscle_name: 'Triceps', sets: 0.5 },
        ],
      }),
    );
    expect(document.querySelector('.create-exercise-dialog')).toBeNull();
    expect(host.querySelector('.training-exercise-notice')?.textContent).toContain(
      'Custom press added',
    );
    expect(
      host.querySelector('[aria-label="Training sections"] [aria-selected="true"]')?.textContent,
    ).toBe(section === 'history' ? 'Sessions' : 'Exercises');
    expect(readActiveWorkoutDraft()).toBeNull();
    if (section === 'history') {
      await click(
        [...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === 'Exercises')!,
      );
    }
    expect(host.querySelector('[data-exercise-id="custom"]')?.textContent).toContain(
      'Custom press',
    );
  },
);

it('cancels without a write or changing the current exercise filters', async () => {
  await render('progress');
  await setValue(host.querySelector('[aria-label="Search exercises"]')!, 'Sample');
  await click(host.querySelector('.exercise-list-toolbar [aria-label="Add exercise"]')!);
  const dialog = document.querySelector('.create-exercise-dialog')!;
  await click(dialog.querySelector('.create-exercise-cancel')!);
  expect(document.querySelector('.create-exercise-dialog')).toBeNull();
  expect(api.createExercise).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLInputElement>('[aria-label="Search exercises"]')?.value).toBe(
    'Sample',
  );
  expect(readActiveWorkoutDraft()).toBeNull();
});
