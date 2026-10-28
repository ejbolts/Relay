// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { RoutinePanel } from './RoutinePanel';
import type { Exercise, Routine } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';

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
const original: Routine = {
  id: 'source',
  name: 'Upper / Rest',
  shared: true,
  days: [
    {
      workout_type_id: 'upper',
      workout_type: DEFAULT_WORKOUT_TYPES[0],
      movements: [
        {
          exercise_id: bench.id,
          exercise: bench,
          sets: [
            {
              reps: 8,
              weight_kg: 50,
              duration_seconds: null,
              distance_km: null,
              rest_seconds: 120,
              set_type: 'normal',
            },
          ],
        },
      ],
    },
    { workout_type_id: null, workout_type: null, movements: [] },
  ],
};
let root: Root;
let host: HTMLDivElement;
async function mount(own = false, onOpenSplits?: (id?: string) => void) {
  await act(async () =>
    root.render(<RoutinePanel ownerId="friend" own={own} onOpenSplits={onOpenSplits} />),
  );
}
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (x) => x.textContent === text || x.getAttribute('aria-label') === text,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
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
async function save() {
  await act(async () =>
    document
      .querySelector('.routine-editor')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.spyOn(api.routines, 'profile').mockResolvedValue([structuredClone(original)]);
  vi.spyOn(api.routines, 'list').mockResolvedValue([structuredClone(original)]);
  vi.spyOn(api.routines, 'copy').mockResolvedValue({
    ...structuredClone(original),
    id: 'copy',
    shared: false,
  });
  vi.spyOn(api.routines, 'save').mockImplementation(async (routine) => routine);
  vi.spyOn(api.routines, 'create').mockImplementation(async (routine) => ({
    ...routine,
    id: 'new',
  }));
  vi.spyOn(api.routines, 'use').mockResolvedValue({
    name: original.name,
    enabled: true,
    start_date: '2026-10-29',
    steps: [],
  });
  vi.spyOn(api, 'listExercises').mockResolvedValue([bench, row]);
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

it('copies into an editable private routine and adapts exercise and weight independently', async () => {
  await mount();
  await click('Save routine');
  expect(api.routines.copy).toHaveBeenCalledWith('friend', 'source');
  expect(document.querySelector<HTMLInputElement>('[role="switch"]')!.checked).toBe(false);
  await input('[aria-label="Day 1 exercise 1"]', 'row');
  await input('[aria-label="Day 1 exercise 1 set 1 weight kg"]', '35');
  await save();
  expect(api.routines.save).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'copy', shared: false }),
  );
  const saved = vi.mocked(api.routines.save).mock.calls[0][0];
  expect(saved.days[0].movements[0]).toMatchObject({
    exercise_id: 'row',
    sets: [{ weight_kg: 35 }],
  });
  expect(original.days[0].movements[0].sets[0].weight_kg).toBe(50);
  expect(api.routines.use).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('opens My splits at the imported copy after dismissing the editor', async () => {
  const open = vi.fn();
  await mount(false, open);
  expect(host.textContent).not.toContain('View my splits');
  await click('Save routine');
  await click('Close Edit routine');
  await click('View my splits');
  expect(open).toHaveBeenCalledWith('copy');
  expect(api.routines.use).not.toHaveBeenCalled();
});

it('keeps edits after a failed save and allows retry', async () => {
  await mount(true);
  await click('Edit routine');
  await input('[aria-label="Day 1 exercise 1 set 1 reps"]', '10');
  vi.mocked(api.routines.save).mockRejectedValueOnce(new Error('Connection lost'));
  await save();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Connection lost');
  expect(
    document.querySelector<HTMLInputElement>('[aria-label="Day 1 exercise 1 set 1 reps"]')!.value,
  ).toBe('10');
  await save();
  expect(api.routines.save).toHaveBeenCalledTimes(2);
});

it('requires an explicit date confirmation before replacing the active split', async () => {
  await mount(true);
  await click('Use split');
  expect(api.routines.use).not.toHaveBeenCalled();
  await input('input[type="date"]', '2026-11-02');
  await act(async () =>
    document
      .querySelector('.routine-use')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(api.routines.use).toHaveBeenCalledWith('source', '2026-11-02');
  expect(host.textContent).toContain('is your active split');
});

it('creates additional routines with workout and rest days and explicit publishing', async () => {
  await mount(true);
  await click('New routine');
  await input('[aria-label="Add exercise to day 1"]', 'bench');
  await click('Add rest day');
  await act(async () => document.querySelector<HTMLInputElement>('[role="switch"]')!.click());
  await save();
  expect(api.routines.create).toHaveBeenCalledWith(
    expect.objectContaining({
      shared: true,
      days: [
        expect.objectContaining({ movements: [expect.objectContaining({ exercise_id: 'bench' })] }),
        expect.objectContaining({ workout_type_id: null }),
      ],
    }),
  );
  expect(host.querySelectorAll('.routine-card')).toHaveLength(2);
});

it('retries failed profile loading and does not open an editor after failed copying', async () => {
  vi.mocked(api.routines.profile).mockRejectedValueOnce(new Error('Offline'));
  await mount();
  expect(host.textContent).toContain('Offline');
  await click('Try again');
  vi.mocked(api.routines.copy).mockRejectedValueOnce(new Error('Routine is no longer shared'));
  await click('Save routine');
  expect(host.textContent).toContain('Routine is no longer shared');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('explains incomplete publishing and keeps the routine editable', async () => {
  await mount(true);
  await click('New routine');
  await act(async () => document.querySelector<HTMLInputElement>('[role="switch"]')!.click());
  await save();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    'Add exercises to every workout day before sharing.',
  );
  expect(api.routines.create).not.toHaveBeenCalled();
  await input('[aria-label="Add exercise to day 1"]', 'bench');
  await save();
  expect(api.routines.create).toHaveBeenCalledOnce();
});

it('edits cardio minutes and distance as planned targets', async () => {
  const cardio: Exercise = {
    ...bench,
    id: 'run',
    name: 'Running',
    category: 'cardio',
    kind: 'cardio',
  };
  const routine = structuredClone(original);
  routine.days[0].movements = [
    {
      exercise_id: cardio.id,
      exercise: cardio,
      sets: [
        {
          ...routine.days[0].movements[0].sets[0],
          reps: null,
          weight_kg: null,
          duration_seconds: 600,
          distance_km: 2,
        },
      ],
    },
  ];
  vi.mocked(api.routines.list).mockResolvedValue([routine]);
  vi.mocked(api.listExercises).mockResolvedValue([bench, row, cardio]);
  await mount(true);
  await click('Edit routine');
  await input('[aria-label="Day 1 exercise 1 set 1 minutes"]', '15.5');
  await input('[aria-label="Day 1 exercise 1 set 1 distance km"]', '3.4');
  await save();
  expect(vi.mocked(api.routines.save).mock.calls[0][0].days[0].movements[0].sets[0]).toMatchObject({
    duration_seconds: 930,
    distance_km: 3.4,
    weight_kg: null,
  });
});
