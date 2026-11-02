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
  vi.spyOn(api, 'getCardioPreferences').mockResolvedValue({
    heart_rate_zones: [],
    goals: [{ zone: 2, minutes: 150 }],
  });
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
  await click('Save split');
  expect(api.routines.copy).toHaveBeenCalledWith('friend', 'source');
  expect(document.querySelector('[role="switch"]')).toBeNull();
  expect(document.querySelector('.routine-editor')?.textContent).not.toContain(
    'Show on my profile',
  );
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
  await click('Save split');
  await click('Close Edit split');
  await click('View my splits');
  expect(open).toHaveBeenCalledWith('copy');
  expect(api.routines.use).not.toHaveBeenCalled();
});

it('keeps edits after a failed save and allows retry', async () => {
  await mount(true);
  await click('Edit split');
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

it('shows save feedback in a dismissible popup that clears automatically after repeated saves', async () => {
  vi.useFakeTimers();
  try {
    await mount(true);
    await click('Edit split');
    await save();
    expect(document.querySelector('.app-notification-toast')?.textContent).toContain(
      'Split saved.',
    );
    expect(host.textContent).not.toContain('Split saved.');
    await click('Close notification');
    expect(document.querySelector('.app-notification-toast')).toBeNull();

    await click('Edit split');
    await save();
    await act(async () => vi.advanceTimersByTime(7000));
    expect(document.querySelector('.app-notification-toast')).not.toBeNull();
    await click('Edit split');
    await save();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(document.querySelector('.app-notification-toast')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(7000));
    expect(document.querySelector('.app-notification-toast')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
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
  expect(document.querySelector('.app-notification-toast')).toBeNull();
  expect(host.textContent).not.toContain('is your active split');
});

it('creates private splits without a publishing switch and shares from split options', async () => {
  await mount(true);
  await click('New split');
  await input('[aria-label="Add exercise to day 1"]', 'bench');
  await click('Add rest day');
  expect(document.querySelector('.routine-editor [role="switch"]')).toBeNull();
  await save();
  expect(api.routines.create).toHaveBeenCalledWith(
    expect.objectContaining({
      shared: false,
      days: [
        expect.objectContaining({ movements: [expect.objectContaining({ exercise_id: 'bench' })] }),
        expect.objectContaining({ workout_type_id: null }),
      ],
    }),
  );
  expect(host.querySelectorAll('.routine-card')).toHaveLength(2);
  await click('Close notification');
  await click('Options for My split');
  await click('Show on my profile');
  expect(api.routines.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'new', shared: true }),
  );
  expect(host.querySelector('.routine-card-meta')?.textContent).toContain('On profile');
  await click('Close notification');
  await click('Options for My split');
  await click('Hide from my profile');
  expect(api.routines.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'new', shared: false }),
  );
});

it('retries failed profile loading and does not open an editor after failed copying', async () => {
  vi.mocked(api.routines.profile).mockRejectedValueOnce(new Error('Offline'));
  await mount();
  expect(host.textContent).toContain('Offline');
  await click('Try again');
  vi.mocked(api.routines.copy).mockRejectedValueOnce(new Error('Routine is no longer shared'));
  await click('Save split');
  expect(host.textContent).toContain('Routine is no longer shared');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('explains how to complete an empty workout day before sharing and allows retry after editing', async () => {
  const routine = structuredClone(original);
  routine.shared = false;
  routine.days.splice(1, 0, {
    workout_type_id: 'pull',
    workout_type: DEFAULT_WORKOUT_TYPES.find((type) => type.id === 'pull')!,
    movements: [],
  });
  vi.mocked(api.routines.list).mockResolvedValue([routine]);
  await mount(true);
  await click('Options for Upper / Rest');
  await click('Show on my profile');
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    'Add an exercise to each workout day in Edit split, then try again.',
  );
  expect(document.querySelector('dialog[open]')?.textContent).toContain('Split options');
  expect(host.querySelector('.routine-card-meta')?.textContent).toContain('Only you');
  expect(api.routines.save).not.toHaveBeenCalled();
  await click('Close Split options');
  await click('Edit split');
  await input('[aria-label="Add exercise to day 2"]', 'row');
  await save();
  await click('Close notification');
  await click('Options for Upper / Rest');
  await click('Show on my profile');
  expect(api.routines.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: routine.id, shared: true }),
  );
  expect(host.querySelector('.routine-card-meta')?.textContent).toContain('On profile');
  expect(document.querySelector('[role="alert"]')).toBeNull();
});

it('keeps failed publishing in split options and preserves the saved privacy state', async () => {
  vi.mocked(api.routines.list).mockResolvedValue([{ ...structuredClone(original), shared: false }]);
  await mount(true);
  await click('Options for Upper / Rest');
  vi.mocked(api.routines.save).mockRejectedValueOnce(new Error('Could not save the split.'));
  await click('Show on my profile');
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Could not save the split.');
  expect(document.querySelector('dialog[open]')?.textContent).toContain('Split options');
  expect(host.querySelector('.routine-card-meta')?.textContent).toContain('Only you');
  expect(api.routines.save).toHaveBeenCalledOnce();
});

it('preserves an existing shared split when editing without a publishing control', async () => {
  await mount(true);
  await click('Edit split');
  expect(document.querySelector('.routine-editor [role="switch"]')).toBeNull();
  await save();
  expect(api.routines.save).toHaveBeenCalledWith(expect.objectContaining({ shared: true }));
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
  await click('Edit split');
  await input('[aria-label="Day 1 exercise 1 set 1 minutes"]', '15.5');
  await input('[aria-label="Day 1 exercise 1 set 1 distance km"]', '3.4');
  await save();
  expect(vi.mocked(api.routines.save).mock.calls[0][0].days[0].movements[0].sets[0]).toMatchObject({
    duration_seconds: 930,
    distance_km: 3.4,
    weight_kg: null,
  });
});

const tray = () => document.querySelector<HTMLElement>('.split-targets')!;
const chip = (muscle: string) =>
  [...tray().querySelectorAll('.split-target-chips li')].find((item) =>
    item.textContent?.includes(muscle),
  );

it('shows planned weekly sets per muscle against the goal and updates them live', async () => {
  await mount(true);
  await click('Edit split');
  // A two-day cycle repeats 3.5 times a week, so one bench set is 3.5 sets of chest.
  expect(chip('Chest')?.textContent).toContain('Chest: 3.5 of 10 sets a week, under target');
  expect(tray().querySelector('.split-targets-count')?.textContent).toBe('0 of 2 on target');
  await click('Add set');
  await click('Add set');
  expect(chip('Chest')?.textContent).toContain('Chest: 10.5 of 10 sets a week, on target');
  expect(chip('Chest')?.className).toContain('is-changed');
  expect(tray().querySelector('.split-targets-count')?.textContent).toBe('1 of 2 on target');
  await act(async () =>
    document
      .querySelector('[aria-label="Day 1 exercise 1 set 3 type"]')!
      .dispatchEvent(new Event('focus', { bubbles: true })),
  );
  await input('[aria-label="Day 1 exercise 1 set 3 type"]', 'warmup');
  expect(chip('Chest')?.textContent).toContain('Chest: 7 of 10 sets a week, nearly there');
});

it('expands to bars that include the combined cardio goal', async () => {
  await mount(true);
  await click('Edit split');
  const toggle = tray().querySelector<HTMLButtonElement>('.split-targets-toggle')!;
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  await act(async () => toggle.click());
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  const rows = [...tray().querySelectorAll('.split-target-bars li')].map(
    (item) => item.querySelector('.sr-only')?.textContent,
  );
  expect(rows).toEqual([
    'Chest: 3.5 of 10 sets a week, under target',
    'Cardio: 0 of 150 minutes a week, under target',
  ]);
  expect(tray().querySelector('.split-target-value')?.textContent).toBe('3.5 / 10');
});

it('leads the collapsed summary with the muscles of the day being edited', async () => {
  const routine = structuredClone(original);
  routine.days[1] = {
    workout_type_id: 'lower',
    workout_type: DEFAULT_WORKOUT_TYPES[1],
    movements: [
      {
        exercise_id: 'squat',
        exercise: {
          ...bench,
          id: 'squat',
          name: 'Squat',
          category: 'lower',
          muscle_group: 'Quads',
        },
        sets: [routine.days[0].movements[0].sets[0], routine.days[0].movements[0].sets[0]],
      },
    ],
  };
  vi.mocked(api.routines.list).mockResolvedValue([routine]);
  await mount(true);
  await click('Edit split');
  const names = () =>
    [...tray().querySelectorAll('.split-target-chips li')].map((item) => ({
      name: item.querySelector('span[aria-hidden]')?.textContent,
      faded: item.classList.contains('is-faded'),
    }));
  expect(names().slice(0, 2)).toEqual([
    { name: 'Chest', faded: false },
    { name: 'Quads', faded: false },
  ]);
  await act(async () =>
    document
      .querySelector('[aria-label="Day 2"]')!
      .dispatchEvent(new Event('pointerdown', { bubbles: true })),
  );
  expect(names().slice(0, 2)).toEqual([
    { name: 'Quads', faded: false },
    { name: 'Chest', faded: true },
  ]);
});
