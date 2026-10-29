// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { TrainingSplitEditor } from './TrainingSplitEditor';
import type { Routine, TrainingSplit, WorkoutType } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';
import { WorkoutTypesContext } from './workoutTypesContext';
let root: Root;
let host: HTMLDivElement;
const saved = vi.fn().mockResolvedValue(undefined);
const plan: Routine = {
  id: 'plan',
  name: 'Upper / Rest',
  shared: false,
  days: [
    { workout_type_id: 'upper', workout_type: DEFAULT_WORKOUT_TYPES[0], movements: [] },
    { workout_type_id: null, workout_type: null, movements: [] },
  ],
};
const current: TrainingSplit = {
  name: plan.name,
  enabled: true,
  start_date: '2026-10-26',
  routine_id: plan.id,
  steps: plan.days.map((d) => ({ workout_type_id: d.workout_type_id })),
};
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
async function mount(initial?: WorkoutType[]) {
  await act(async () => root.render(<Harness initial={initial} />));
}
function button(text: string) {
  const b = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent === text || b.getAttribute('aria-label') === text,
  );
  if (!b) throw new Error('Missing ' + text);
  return b;
}
async function click(text: string) {
  await act(async () => button(text).click());
}
async function input(selector: string, value: string) {
  await act(async () => {
    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      'value',
    )!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function submit(selector = '.routine-editor') {
  await act(async () =>
    document
      .querySelector(selector)!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T12:00:00'));
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.spyOn(api, 'getTrainingSplit').mockResolvedValue(structuredClone(current));
  vi.spyOn(api.routines, 'list').mockResolvedValue([structuredClone(plan)]);
  vi.spyOn(api.routines, 'save').mockImplementation(async (r) => r);
  vi.spyOn(api.routines, 'create').mockImplementation(async (r) => ({ ...r, id: 'new' }));
  vi.spyOn(api.routines, 'use').mockResolvedValue(current);
  vi.spyOn(api, 'listExercises').mockResolvedValue([]);
  vi.spyOn(api, 'saveTrainingSplit').mockImplementation(async (s) => s);
  vi.spyOn(api, 'createWorkoutType').mockImplementation(async (t) => ({
    ...t,
    id: 'custom',
    is_custom: true,
    archived: false,
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
  vi.useRealTimers();
  saved.mockClear();
});
it('shows one page with the active split expanded, preview and inline templates without tabs', async () => {
  await mount();
  expect(host.querySelector('[aria-label="Workout split views"]')).toBeNull();
  expect(host.querySelector<HTMLDetailsElement>('.routine-card')?.open).toBe(true);
  expect(host.querySelector('.routine-active')?.textContent).toBe('Active');
  expect(host.querySelectorAll('.split-preview > li')).toHaveLength(7);
  expect(host.querySelector('[aria-label="Split templates"]')).not.toBeNull();
  expect(host.textContent).not.toMatch(/routine|Schedule/);
  expect(api.routines.create).not.toHaveBeenCalled();
});
it('creates from a template without replacing the active split and retains edits after a failed save', async () => {
  await mount();
  await click('Push / Pull / Legs');
  await input('.routine-editor input', 'My PPL');
  await click('Add rest day');
  await click('Move day 5 earlier');
  vi.mocked(api.routines.create).mockRejectedValueOnce(new Error('Offline'));
  await submit();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Offline');
  expect(document.querySelector<HTMLInputElement>('.routine-editor input')?.value).toBe('My PPL');
  await submit();
  expect(vi.mocked(api.routines.create).mock.calls.at(-1)?.[0]).toMatchObject({
    name: 'My PPL',
    days: [
      { workout_type_id: 'push' },
      { workout_type_id: 'pull' },
      { workout_type_id: 'lower' },
      { workout_type_id: null },
      { workout_type_id: null },
    ],
  });
  expect(api.routines.use).not.toHaveBeenCalled();
  expect(host.querySelectorAll('.routine-card')).toHaveLength(2);
  expect(host.querySelector('.routine-active')?.closest('.routine-card')?.textContent).toContain(
    'Upper / Rest',
  );
});
it('activates a different split after date confirmation, expands it and refreshes Home without leaving', async () => {
  const other = { ...structuredClone(plan), id: 'other', name: 'Another split' };
  vi.mocked(api.routines.list).mockResolvedValue([plan, other]);
  vi.mocked(api.routines.use).mockResolvedValue({
    ...current,
    routine_id: 'other',
    name: other.name,
  });
  await mount();
  await act(async () => host.querySelectorAll<HTMLElement>('.routine-card > summary')[1].click());
  await click('Use split');
  await input('.routine-use input[type="date"]', '2026-11-02');
  await submit('.routine-use');
  expect(api.routines.use).toHaveBeenCalledWith('other', '2026-11-02');
  expect(host.querySelector('.routine-active')?.closest('.routine-card')?.textContent).toContain(
    'Another split',
  );
  expect(saved).toHaveBeenCalledOnce();
  expect(host.querySelectorAll('.split-card-preview')).toHaveLength(1);
});
it('edits the active split and its start/enabled state in one save', async () => {
  await mount();
  await click('Edit split');
  await input('.routine-editor input', 'Updated plan');
  await input('.routine-editor input[type="date"]', '2026-11-03');
  await act(async () =>
    document.querySelector<HTMLInputElement>('.split-editor-schedule [role="switch"]')!.click(),
  );
  await submit();
  expect(api.routines.save).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Updated plan' }),
    { start_date: '2026-11-03', enabled: false },
  );
  expect(host.querySelector('.routine-active')).toBeNull();
  expect(saved).toHaveBeenCalledWith(
    expect.objectContaining({ enabled: false, name: 'Updated plan' }),
  );
});
it('preserves an existing unlinked split without writes and links it atomically only on save', async () => {
  vi.mocked(api.getTrainingSplit).mockResolvedValue({ ...current, routine_id: null });
  vi.mocked(api.routines.list).mockResolvedValue([]);
  await mount();
  expect(host.querySelector('.routine-active')).not.toBeNull();
  expect(api.routines.create).not.toHaveBeenCalled();
  await click('Edit split');
  await submit();
  expect(api.routines.create).toHaveBeenCalledWith(expect.objectContaining({ name: plan.name }), {
    start_date: current.start_date,
    enabled: true,
  });
  expect(host.querySelectorAll('.routine-card')).toHaveLength(1);
  expect(saved).toHaveBeenCalledWith(
    expect.objectContaining({ routine_id: 'new', start_date: current.start_date }),
  );
});
it('toggles the shared two-month calendar without month paging and returns to the seven-day view', async () => {
  await mount();
  await click('Next preview week');
  const first = host.querySelector('.split-preview > li')?.getAttribute('aria-label');
  await click('Two-month calendar');
  expect([...host.querySelectorAll('.calendar-month h3')].map((e) => e.textContent)).toEqual([
    'October 2026',
    'November 2026',
  ]);
  expect(host.textContent).not.toContain('Next 2 months');
  expect(host.querySelector('.calendar-day:not(.empty):not(:disabled)')).toBeNull();
  await click('Two-month calendar');
  expect(host.querySelector('.split-preview > li')?.getAttribute('aria-label')).toBe(first);
});
it('creates custom types in the editor and preserves consecutive rest days when saved', async () => {
  await mount();
  await click('New split');
  await input('[aria-label="Workout type name"]', 'Full body A');
  await click('Add type');
  await click('Add rest day');
  await submit();
  expect(api.createWorkoutType).toHaveBeenCalledWith({ name: 'Full body A', color: '#a855f7' });
  expect(vi.mocked(api.routines.create).mock.calls[0][0].days.at(-2)?.workout_type_id).toBe(
    'custom',
  );
  expect(vi.mocked(api.routines.create).mock.calls[0][0].days.at(-1)?.workout_type_id).toBeNull();
});
it('blocks all-rest and archived types without losing editor values', async () => {
  await mount(DEFAULT_WORKOUT_TYPES.map((t) => ({ ...t, archived: t.id === 'upper' })));
  await click('Edit split');
  await submit();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('active workout type');
  await input('[aria-label="Day 1 workout type"]', '');
  await submit();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    'Include at least one workout day.',
  );
  expect(api.routines.save).not.toHaveBeenCalled();
});
it('retries unknown split state before displaying editable plans', async () => {
  vi.mocked(api.getTrainingSplit).mockRejectedValueOnce(new Error('Unavailable'));
  await mount();
  expect(host.textContent).toContain('Unavailable');
  expect(host.querySelector('.routine-card')).toBeNull();
  await click('Try again');
  expect(host.querySelector('.routine-active')).not.toBeNull();
});
it('can collapse the active card and reopen it with keyboard-native summary semantics', async () => {
  await mount();
  const summary = host.querySelector<HTMLElement>('.routine-card > summary')!;
  await act(async () => summary.click());
  expect(host.querySelector<HTMLDetailsElement>('.routine-card')?.open).toBe(false);
  await act(async () => summary.click());
  expect(host.querySelector<HTMLDetailsElement>('.routine-card')?.open).toBe(true);
});
it('opens an imported split without forcing the existing active card open', async () => {
  vi.mocked(api.routines.list).mockResolvedValue([
    plan,
    { ...plan, id: 'import', name: 'Imported split' },
  ]);
  await act(async () =>
    root.render(<TrainingSplitEditor onSaved={saved} initialRoutineId="import" />),
  );
  expect(host.querySelector<HTMLDetailsElement>('[data-routine-id="import"]')?.open).toBe(true);
  expect(host.querySelector<HTMLDetailsElement>('[data-routine-id="plan"]')?.open).toBe(false);
});
it('keeps the current active split after a failed activation and allows retry', async () => {
  vi.mocked(api.routines.list).mockResolvedValue([
    plan,
    { ...plan, id: 'other', name: 'Other split' },
  ]);
  vi.mocked(api.routines.use).mockRejectedValueOnce(new Error('Connection lost'));
  await mount();
  await act(async () =>
    host.querySelector<HTMLElement>('[data-routine-id="other"] > summary')!.click(),
  );
  await click('Use split');
  await submit('.routine-use');
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Connection lost');
  expect(
    host
      .querySelector('.routine-active')
      ?.closest('.routine-card')
      ?.getAttribute('data-routine-id'),
  ).toBe('plan');
  vi.mocked(api.routines.use).mockResolvedValue({
    ...current,
    routine_id: 'other',
    name: 'Other split',
  });
  await submit('.routine-use');
  expect(
    host
      .querySelector('.routine-active')
      ?.closest('.routine-card')
      ?.getAttribute('data-routine-id'),
  ).toBe('other');
});
it('Enter adds the named custom workout type without submitting the split', async () => {
  await mount();
  await click('New split');
  await input('[aria-label="Workout type name"]', 'Full body B');
  await act(async () =>
    document
      .querySelector<HTMLInputElement>('[aria-label="Workout type name"]')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      ),
  );
  expect(api.createWorkoutType).toHaveBeenCalledWith({ name: 'Full body B', color: '#a855f7' });
  expect(api.routines.create).not.toHaveBeenCalled();
});
