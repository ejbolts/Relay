// @vitest-environment jsdom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api, ApiError } from './api';
import { createToastRoot, toastButton, toastText } from './toastTestUtils';
import { addDays } from './trainingSummary';
import type { DashboardData, TrainingSplit, WorkoutType } from './types';
import { localDate } from './utils';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    api: {
      ...original.api,
      workoutRevision: vi.fn().mockResolvedValue({ revision: 'initial' }),
      dashboard: vi.fn(),
      listExercises: vi.fn().mockResolvedValue([]),
      listWorkouts: vi.fn().mockResolvedValue([]),
      listBodyMeasurements: vi.fn().mockResolvedValue([]),
      listPersonalRecords: vi.fn().mockResolvedValue([]),
      getWorkoutTypeColors: vi.fn().mockResolvedValue({}),
      getWorkoutTypes: vi.fn(),
      moveTrainingSplit: vi.fn(),
      routines: { ...original.api.routines, list: vi.fn().mockResolvedValue([]) },
    },
  };
});
vi.mock('./workoutCache', () => ({
  readDashboardCache: vi.fn().mockResolvedValue(null),
  writeDashboardCache: vi.fn().mockResolvedValue(undefined),
  readWorkoutCache: vi.fn().mockResolvedValue(null),
  writeWorkoutCache: vi.fn().mockResolvedValue(undefined),
}));

const today = localDate();
const type = (id: string, name: string): WorkoutType => ({
  id,
  name,
  color: '#3b82f6',
  is_custom: false,
  archived: false,
});
const types = [type('push', 'Push'), type('pull', 'Pull'), type('lower', 'Lower body')];

/** Push / Pull / Lower / Rest by date, with today on `step`. */
function datedSplit(step: number, extra: Partial<TrainingSplit> = {}): TrainingSplit {
  return {
    name: 'PPL',
    enabled: true,
    start_date: addDays(today, -step - 8),
    progression: 'calendar',
    steps: [
      { workout_type_id: 'push' },
      { workout_type_id: 'pull' },
      { workout_type_id: 'lower' },
      { workout_type_id: null },
    ],
    auto_shift: true,
    shift: null,
    catch_up: null,
    ...extra,
  };
}

function dashboardFor(split: TrainingSplit, step: number): DashboardData {
  const typeId = split.steps[step].workout_type_id;
  const workoutType = types.find((item) => item.id === typeId) ?? null;
  return {
    recommendation: {
      category: typeId ?? 'other',
      session_name: workoutType ? `${workoutType.name} workout` : 'Rest day',
      rotation_next: typeId ?? 'other',
      reason: `Day ${step + 1}`,
      muscle_frequency: [],
      workout_type: workoutType,
      is_rest_day: typeId === null,
      split_name: split.name,
      scheduled_date: today,
    },
    training_split: split,
  } as unknown as DashboardData;
}

let root: Root;
let container: HTMLDivElement;

const heading = () => container.querySelector('#next-session-title')?.textContent;
const skipButton = () => container.querySelector<HTMLButtonElement>('.next-session-skip');
const mount = () => act(async () => root.render(<App />));

beforeEach(() => {
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
  vi.mocked(api.getWorkoutTypes).mockResolvedValue(types);
  container = document.createElement('div');
  document.body.append(container);
  root = createToastRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('Skip on Up next', () => {
  it('moves the split to the next workout day, with Undo', async () => {
    const split = datedSplit(0);
    vi.mocked(api.dashboard).mockResolvedValue(dashboardFor(split, 0));
    await mount();
    expect(heading()).toBe('Push day');
    expect(skipButton()?.getAttribute('aria-label')).toBe('Skip push day');

    const shifted = datedSplit(0, { shift: { from_date: today, step: 1 } });
    vi.mocked(api.moveTrainingSplit).mockResolvedValue(shifted);
    vi.mocked(api.dashboard).mockResolvedValue(dashboardFor(shifted, 1));
    await act(async () => skipButton()!.click());
    expect(api.moveTrainingSplit).toHaveBeenCalledWith(1, { rest_saved: false });
    expect(heading()).toBe('Pull day');
    expect(toastText()).toBe('Skipped Push · Pull is up next');

    vi.mocked(api.dashboard).mockResolvedValue(dashboardFor(split, 0));
    await act(async () => toastButton('Undo')!.click());
    expect(api.moveTrainingSplit).toHaveBeenLastCalledWith(0, { rest_saved: false });
    expect(heading()).toBe('Push day');
  });

  it('passes over rest days and is hidden when the split has no other workout day', async () => {
    vi.mocked(api.dashboard).mockResolvedValue(dashboardFor(datedSplit(2), 2));
    vi.mocked(api.moveTrainingSplit).mockResolvedValue(datedSplit(2));
    await mount();
    await act(async () => skipButton()!.click());
    // Lower body skips straight to Push, not the planned rest.
    expect(api.moveTrainingSplit).toHaveBeenCalledWith(0, { rest_saved: false });
    await act(async () => root.unmount());

    const everyOtherDay = {
      ...datedSplit(0),
      steps: [{ workout_type_id: 'push' }, { workout_type_id: null }],
    };
    root = createToastRoot(container);
    vi.mocked(api.dashboard).mockResolvedValue(dashboardFor(everyOtherDay, 0));
    await mount();
    expect(heading()).toBe('Push day');
    expect(skipButton()).toBeNull();
  });

  it("keeps a followed split's saved rest when skipping", async () => {
    const followed = datedSplit(0, {
      progression: 'workouts',
      next_step: 1,
      rest_saved: true,
      next_date: today,
    });
    vi.mocked(api.dashboard).mockResolvedValue(dashboardFor(followed, 1));
    vi.mocked(api.moveTrainingSplit).mockResolvedValue(followed);
    await mount();
    await act(async () => skipButton()!.click());
    expect(api.moveTrainingSplit).toHaveBeenCalledWith(2, { rest_saved: true });
  });

  it('shows why a skip failed', async () => {
    vi.mocked(api.dashboard).mockResolvedValue(dashboardFor(datedSplit(0), 0));
    vi.mocked(api.moveTrainingSplit).mockRejectedValue(new Error('Turn on a split first.'));
    await mount();
    await act(async () => skipButton()!.click());
    expect(toastText()).toBe('Turn on a split first.');
  });
});

describe('catching up after missed workouts', () => {
  const missed = datedSplit(0, { catch_up: { on_date: today, step: 1, missed: 2 } });

  it('shifts the split once on opening, with Undo', async () => {
    const caughtUp = datedSplit(0, { shift: { from_date: today, step: 1 } });
    vi.mocked(api.dashboard)
      .mockResolvedValueOnce(dashboardFor(missed, 0))
      .mockResolvedValue(dashboardFor(caughtUp, 1));
    vi.mocked(api.moveTrainingSplit).mockResolvedValue(caughtUp);
    await mount();
    expect(api.moveTrainingSplit).toHaveBeenCalledWith(1, { catch_up: true });
    expect(heading()).toBe('Pull day');
    expect(toastText()).toBe('Split shifted after 2 missed workouts · Pull today');

    vi.mocked(api.dashboard).mockResolvedValue(dashboardFor(missed, 0));
    await act(async () => toastButton('Undo')!.click());
    expect(api.moveTrainingSplit).toHaveBeenLastCalledWith(0, { rest_saved: false });
    // The same catch-up is not attempted again in this session.
    expect(api.moveTrainingSplit).toHaveBeenCalledTimes(2);
  });

  it('stays quiet when another device already caught up', async () => {
    vi.mocked(api.dashboard).mockResolvedValue(dashboardFor(missed, 0));
    vi.mocked(api.moveTrainingSplit).mockRejectedValue(
      new ApiError('Your split is already up to date.', 'split_up_to_date', 409),
    );
    await mount();
    expect(api.moveTrainingSplit).toHaveBeenCalledTimes(1);
    expect(toastText()).toBeNull();
  });

  it('ignores a catch-up worked out for another day', async () => {
    vi.mocked(api.dashboard).mockResolvedValue(
      dashboardFor(
        datedSplit(0, { catch_up: { on_date: addDays(today, -1), step: 1, missed: 2 } }),
        0,
      ),
    );
    await mount();
    expect(api.moveTrainingSplit).not.toHaveBeenCalled();
  });
});
