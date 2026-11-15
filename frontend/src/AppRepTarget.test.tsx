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
import type { DashboardData, Exercise, RepRange, TrackedWorkout } from './types';

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
let root: Root;
let container: HTMLDivElement;

/** A workout in progress with one planned bench press, optionally carrying a rep range. */
function liveDraft(repRange?: RepRange) {
  const startedAt = Date.now() - 60_000;
  const draft: ActiveWorkoutDraft = {
    version: 1,
    startedAt,
    updatedAt: startedAt,
    lastActiveAt: startedAt,
    inactiveFinishAt: startedAt + 3 * 60 * 60 * 1000,
    name: 'Push workout',
    workoutDate: '2026-11-14',
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
        ...(repRange && { repRange }),
        sets: [
          {
            ...createWorkoutSet('strength'),
            key: 'set-0',
            reps: null,
            weight_kg: null,
            set_type: 'normal',
            warmup: false,
            completed: false,
          },
        ],
      },
    ],
  };
  writeActiveWorkoutDraft(draft);
}

/** The last saved session of the bench press, with the given reps at 80 kg. */
function lastSession(reps: number[]): TrackedWorkout {
  return {
    id: 'last-push',
    name: 'Push workout',
    workout_date: '2026-11-10',
    category: 'push',
    notes: null,
    duration_minutes: 40,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: '2026-11-10T08:00:00Z',
    updated_at: '2026-11-10T08:00:00Z',
    movements: [
      {
        id: 'last-movement',
        order_index: 0,
        exercise: bench,
        notes: null,
        machine_photos: [],
        superset_group_id: null,
        superset_name: null,
        sets: reps.map((count, index) => ({
          ...createWorkoutSet('strength'),
          id: `last-set-${index}`,
          order_index: index,
          reps: count,
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
        })),
      },
    ],
  };
}

async function mount() {
  await act(async () => root.render(<App />));
}

function target() {
  return container.querySelector('.movement-rep-target')?.textContent ?? null;
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

describe('rep range target on a planned exercise', () => {
  it('names the target alone before the exercise has any history', async () => {
    liveDraft({ min: 8, max: 12 });
    await mount();
    expect(target()).toBe('Target 8–12 reps');
  });

  it('keeps the weight while the last session fell short of the top of the range', async () => {
    liveDraft({ min: 8, max: 12 });
    vi.mocked(api.listWorkouts).mockResolvedValue([lastSession([12, 10, 9])]);
    await mount();
    expect(target()).toBe('Target 8–12 reps · stay at 80 kg');
  });

  it('suggests more weight once every set reached the top of the range', async () => {
    liveDraft({ min: 8, max: 12 });
    vi.mocked(api.listWorkouts).mockResolvedValue([lastSession([12, 12, 12])]);
    await mount();
    expect(target()).toBe('Target 8–12 reps · try 82.5 kg');
    // The range stays with the workout in progress.
    expect(readActiveWorkoutDraft()?.movements[0].repRange).toEqual({ min: 8, max: 12 });
  });

  it('starts a planned day with its range and the suggested weight in the blank sets', async () => {
    const push = { id: 'push', name: 'Push', color: '#ef476f', is_custom: false, archived: false };
    const planned = {
      reps: null,
      weight_kg: null,
      duration_seconds: null,
      distance_km: null,
      rest_seconds: 120,
      set_type: 'normal' as const,
    };
    window.history.replaceState(null, '', '#dashboard');
    vi.spyOn(api.routines, 'list').mockResolvedValue([]);
    vi.spyOn(api, 'getWorkoutTypes').mockResolvedValue([push]);
    vi.mocked(api.listWorkouts).mockResolvedValue([lastSession([12, 12, 12])]);
    vi.mocked(api.dashboard).mockResolvedValue({
      recommendation: {
        category: 'push',
        session_name: 'Push workout',
        rotation_next: 'push',
        reason: 'Day 1',
        muscle_frequency: [],
        workout_type: push,
        split_name: 'My split',
        scheduled_date: '2026-11-14',
        routine_day: {
          workout_type_id: 'push',
          workout_type: push,
          movements: [
            {
              exercise_id: bench.id,
              exercise: bench,
              sets: [{ ...planned, set_type: 'warmup' }, planned, { ...planned, weight_kg: 70 }],
              rep_range: { min: 8, max: 12 },
            },
          ],
        },
      },
    } as unknown as DashboardData);
    await mount();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.next-session-actions button')!.click(),
    );
    expect(window.location.hash).toBe('#log');
    expect(target()).toBe('Target 8–12 reps · try 82.5 kg');
    const movement = readActiveWorkoutDraft()!.movements[0];
    expect(movement.repRange).toEqual({ min: 8, max: 12 });
    // The warm-up stays blank, the blank working set takes the target, a planned weight is kept.
    expect(movement.sets.map((item) => [item.weight_kg, item.completed])).toEqual([
      [null, false],
      [82.5, false],
      [70, false],
    ]);
  });

  it('shows no target for an exercise without a planned range', async () => {
    liveDraft();
    vi.mocked(api.listWorkouts).mockResolvedValue([lastSession([12, 12, 12])]);
    await mount();
    expect(container.querySelector('.movement-card')).not.toBeNull();
    expect(target()).toBeNull();
  });
});
