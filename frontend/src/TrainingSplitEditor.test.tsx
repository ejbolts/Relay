// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { TrainingSplitEditor } from './TrainingSplitEditor';
import { splitFromTemplate } from './trainingSplit';
import type { Routine, WorkoutType } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';
import { WorkoutTypesContext } from './workoutTypesContext';

let root: Root;
let host: HTMLDivElement;
const saved = vi.fn().mockResolvedValue(undefined);

function Harness({ initial = DEFAULT_WORKOUT_TYPES }: { initial?: WorkoutType[] }) {
  const [types, setTypes] = useState(initial);
  return (
    <WorkoutTypesContext.Provider
      value={{
        types,
        loading: false,
        error: null,
        reload: async () => undefined,
        applySaved: setTypes,
      }}
    >
      <TrainingSplitEditor onSaved={saved} />
    </WorkoutTypesContext.Provider>
  );
}
function button(label: string) {
  const match = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.getAttribute('aria-label') === label || item.textContent === label,
  );
  if (!match) throw new Error(`Missing button ${label}`);
  return match;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function input(selector: string, value: string) {
  await act(async () => {
    const el = host.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      'value',
    )!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}
async function mount(initial?: WorkoutType[]) {
  await act(async () => root.render(<Harness initial={initial} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T12:00:00'));
  vi.spyOn(api, 'getTrainingSplit').mockResolvedValue(null);
  vi.spyOn(api, 'saveTrainingSplit').mockImplementation(async (split) => split);
  vi.spyOn(api, 'createWorkoutType').mockImplementation(async (input) => ({
    ...input,
    id: 'custom-a',
    is_custom: true,
    archived: false,
  }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

const imported: Routine = {
  id: 'imported-copy',
  name: 'Friend upper split',
  shared: false,
  days: [
    { workout_type_id: 'upper', workout_type: DEFAULT_WORKOUT_TYPES[0], movements: [] },
    { workout_type_id: null, workout_type: null, movements: [] },
  ],
};

it('lists imported private splits in My splits and retains unsaved schedule edits between views', async () => {
  vi.spyOn(api.routines, 'list').mockResolvedValue([imported]);
  await mount();
  await input('input[type="text"]', 'Unsaved schedule');
  await click('My splits');
  expect(api.routines.list).toHaveBeenCalledOnce();
  expect(host.textContent).toContain('Friend upper split');
  expect(host.textContent).toContain('Only you');
  await click('Schedule');
  expect(host.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe(
    'Unsaved schedule',
  );
  expect(api.saveTrainingSplit).not.toHaveBeenCalled();
});

it('opens the imported split from navigation and reflects activation in Schedule', async () => {
  vi.spyOn(api.routines, 'list').mockResolvedValue([imported]);
  const active = {
    name: imported.name,
    enabled: true,
    start_date: '2026-10-26',
    routine_id: imported.id,
    steps: imported.days.map((day) => ({ workout_type_id: day.workout_type_id })),
  };
  vi.spyOn(api.routines, 'use').mockImplementation(async () => {
    vi.mocked(api.getTrainingSplit).mockResolvedValue(active);
    return active;
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  await act(async () =>
    root.render(
      <TrainingSplitEditor onSaved={saved} initialView="saved" initialRoutineId={imported.id} />,
    ),
  );
  expect(host.querySelector<HTMLDetailsElement>('.routine-card')!.open).toBe(true);
  expect(host.querySelector('.routine-active')).toBeNull();
  await click('Use split');
  expect(api.routines.use).not.toHaveBeenCalled();
  await act(async () =>
    document
      .querySelector('.routine-use')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(api.routines.use).toHaveBeenCalledWith(imported.id, '2026-10-26');
  expect(host.querySelector('.routine-active')?.textContent).toBe('Active');
  await click('Schedule');
  expect(host.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe(imported.name);
  expect(host.querySelectorAll('.split-cycle > li')).toHaveLength(2);
  expect(saved).not.toHaveBeenCalled();
});

it('refreshes Schedule after editing the active saved split', async () => {
  vi.spyOn(api.routines, 'list').mockResolvedValue([imported]);
  const active = {
    name: imported.name,
    enabled: true,
    start_date: '2026-10-26',
    routine_id: imported.id,
    steps: imported.days.map((day) => ({ workout_type_id: day.workout_type_id })),
  };
  vi.mocked(api.getTrainingSplit).mockResolvedValue(active);
  vi.spyOn(api, 'listExercises').mockResolvedValue([]);
  vi.spyOn(api.routines, 'save').mockImplementation(async (routine) => {
    vi.mocked(api.getTrainingSplit).mockResolvedValue({ ...active, name: routine.name });
    return routine;
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  await act(async () => root.render(<TrainingSplitEditor onSaved={saved} initialView="saved" />));
  await click('Edit routine');
  await act(async () => {
    const name = document.querySelector<HTMLInputElement>('.routine-editor input')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      name,
      'Adapted active split',
    );
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    document
      .querySelector('.routine-editor')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  await click('Schedule');
  expect(host.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe(
    'Adapted active split',
  );
});
it('marks a saved split active only while its schedule is switched on', async () => {
  vi.spyOn(api.routines, 'list').mockResolvedValue([imported]);
  const linked = {
    name: imported.name,
    enabled: false,
    start_date: '2026-10-26',
    routine_id: imported.id,
    steps: imported.days.map((day) => ({ workout_type_id: day.workout_type_id })),
  };
  vi.mocked(api.getTrainingSplit).mockResolvedValue(linked);
  await act(async () => root.render(<TrainingSplitEditor onSaved={saved} initialView="saved" />));
  expect(host.textContent).toContain('Friend upper split');
  expect(host.querySelector('.routine-active')).toBeNull();
  await act(async () => root.unmount());
  root = createRoot(host);
  vi.mocked(api.getTrainingSplit).mockResolvedValue({ ...linked, enabled: true });
  await act(async () => root.render(<TrainingSplitEditor onSaved={saved} initialView="saved" />));
  expect(host.querySelector('.routine-active')?.textContent).toBe('Active');
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  saved.mockClear();
});

it('selects templates, edits/reorders cycle days and persists the user-defined split', async () => {
  await mount();
  await click('Push / Pull / Legs');
  expect(host.querySelectorAll('.split-cycle > li')).toHaveLength(4);
  await input('[aria-label="Day 2 workout type"]', 'upper');
  await click('Move day 2 earlier');
  await click('Rest day');
  await click('Remove day 5');
  await input('input[type="text"]', 'My training');
  await submit();
  expect(api.saveTrainingSplit).toHaveBeenCalledWith({
    name: 'My training',
    enabled: true,
    start_date: '2026-10-26',
    steps: [
      { workout_type_id: 'upper' },
      { workout_type_id: 'push' },
      { workout_type_id: 'lower' },
      { workout_type_id: null },
    ],
  });
  expect(saved).toHaveBeenCalledOnce();
});

it('previews FBEOD into the following week without resetting it', async () => {
  await mount();
  await click('Full body every other day (FBEOD)');
  expect(host.querySelector('.split-preview > li')?.getAttribute('aria-label')).toContain(
    'Full body',
  );
  await click('Next preview week');
  expect(host.querySelector('.split-preview > li')?.getAttribute('aria-label')).toContain(
    'Monday 2 November: Rest',
  );
  await input('input[type="date"]', '2026-11-03');
  expect(host.querySelector('.split-preview > li')?.getAttribute('aria-label')).toContain(
    'Tuesday 3 November: Full body',
  );
});

it('saves consecutive rest days, reopens them and lets a rest day become a workout', async () => {
  await mount();
  await click('Rest day');
  await click('Move day 4 earlier');
  await submit();
  const existing = vi.mocked(api.saveTrainingSplit).mock.calls[0][0];
  expect(existing.steps.map((step) => step.workout_type_id)).toEqual([
    'upper',
    'lower',
    null,
    null,
  ]);
  vi.mocked(api.getTrainingSplit).mockResolvedValue(existing);
  await act(async () => root.unmount());
  root = createRoot(host);
  await mount();
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Day 3 workout type"]')?.value).toBe(
    '',
  );
  expect(host.querySelectorAll('.split-preview strong')[2].textContent).toBe('Rest');
  expect(host.querySelectorAll('.split-preview strong')[3].textContent).toBe('Rest');
  await input('[aria-label="Day 3 workout type"]', 'pull');
  await submit();
  expect(vi.mocked(api.saveTrainingSplit).mock.calls.at(-1)?.[0].steps[2]).toEqual({
    workout_type_id: 'pull',
  });
});

it('adds a custom workout type and uses its ID in the saved cycle', async () => {
  await mount();
  await input('#split-type-name', 'Full body A');
  await click('Add type');
  await submit();
  expect(api.createWorkoutType).toHaveBeenCalledWith({ name: 'Full body A', color: '#a855f7' });
  expect(vi.mocked(api.saveTrainingSplit).mock.calls[0][0].steps.at(-1)).toEqual({
    workout_type_id: 'custom-a',
  });
});

it('loads a saved split and can disable it without deleting its pattern', async () => {
  const existing = splitFromTemplate('fbeod', '2026-10-20');
  vi.mocked(api.getTrainingSplit).mockResolvedValue(existing);
  await mount();
  await act(async () => host.querySelector<HTMLInputElement>('#split-enabled')!.click());
  await submit();
  expect(api.saveTrainingSplit).toHaveBeenCalledWith({ ...existing, enabled: false });
});

it('keeps unsaved edits after a failed save and allows a retry', async () => {
  vi.mocked(api.saveTrainingSplit).mockRejectedValueOnce(new Error('Connection lost'));
  await mount();
  await input('input[type="text"]', 'My split');
  await submit();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('Connection lost');
  expect(saved).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('My split');
  await submit();
  expect(saved).toHaveBeenCalledOnce();
});

it('shows a load failure without saving over an unknown existing split', async () => {
  vi.mocked(api.getTrainingSplit).mockRejectedValueOnce(new Error('Unable to load'));
  await mount();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('Unable to load');
  expect(host.querySelector('form')).toBeNull();
  await click('Try again');
  expect(host.querySelector('form')).not.toBeNull();
});

it('blocks all-rest cycles and archived workout types without losing the form', async () => {
  await mount(DEFAULT_WORKOUT_TYPES.map((type) => ({ ...type, archived: type.id === 'upper' })));
  await submit();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('day 1');
  await input('[aria-label="Day 1 workout type"]', '');
  await input('[aria-label="Day 2 workout type"]', '');
  await submit();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    'Include at least one workout day.',
  );
  expect(api.saveTrainingSplit).not.toHaveBeenCalled();
});
