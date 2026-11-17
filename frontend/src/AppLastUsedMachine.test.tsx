// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
import { readDashboardCache, writeDashboardCache } from './workoutCache';
import { readActiveWorkoutDraft } from './workoutDraft';
import type { DashboardData, Exercise, MachinePhotoUsage } from './types';

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

const hackSquat: Exercise = {
  id: 'hack-squat',
  name: 'Hack Squat',
  category: 'lower',
  kind: 'strength',
  muscle_group: 'Quads',
  equipment: 'Machine',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const machine = {
  id: 'panatta',
  caption: 'Panatta Hack Squat',
  thumbnail_url: '/media/panatta-thumb.jpg',
  full_url: '/media/panatta.jpg',
  created_at: '2026-11-01T08:00:00Z',
  exercise_name: 'Hack Squat',
  workout_count: 4,
  last_used_date: '2026-11-14',
} as unknown as MachinePhotoUsage;
const lower = { id: 'lower', name: 'Lower', color: '#f59e0b', is_custom: false, archived: false };
let root: Root;
let container: HTMLDivElement;

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
  window.history.replaceState(null, '', '#dashboard');
  const planned = {
    reps: 8,
    weight_kg: 135,
    duration_seconds: null,
    distance_km: null,
    rest_seconds: 120,
    set_type: 'normal' as const,
  };
  vi.mocked(api.dashboard).mockResolvedValue({
    recommendation: {
      category: 'lower',
      session_name: 'Lower workout',
      rotation_next: 'lower',
      reason: 'Day 2',
      muscle_frequency: [],
      workout_type: lower,
      split_name: 'Upper / Lower',
      scheduled_date: '2026-11-17',
      routine_day: {
        workout_type_id: 'lower',
        workout_type: lower,
        movements: [{ exercise_id: hackSquat.id, exercise: hackSquat, sets: [planned, planned] }],
      },
    },
  } as unknown as DashboardData);
  vi.spyOn(api.routines, 'list').mockResolvedValue([]);
  vi.spyOn(api, 'getWorkoutTypes').mockResolvedValue([lower]);
  vi.mocked(api.listExercises).mockResolvedValue([hackSquat]);
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
  vi.mocked(api.listMachinePhotos).mockResolvedValue([machine]);
  vi.mocked(api.lastUsedMachinePhotos).mockResolvedValue([machine]);
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

it('keeps the last-used machine when a planned workout starts', async () => {
  await act(async () => root.render(<App />));
  await act(async () =>
    container.querySelector<HTMLButtonElement>('.next-session-actions button')!.click(),
  );
  // Let the first draft save and the machine lookup settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  expect(window.location.hash).toBe('#log');
  // One logger for the whole start: its machine lookup is asked once and its answer is used.
  expect(api.lastUsedMachinePhotos).toHaveBeenCalledTimes(1);
  expect(readActiveWorkoutDraft()?.movements[0].machinePhotoIds).toEqual([machine.id]);
  expect(container.querySelector('.machine-photo-summary')?.textContent).toContain(
    'Panatta Hack Squat',
  );
});
