// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { ExerciseLibraryList } from './ExerciseLibraryList';
import { ExerciseMuscleHelp } from './ExerciseMuscleHelp';
import { ExerciseCreditsContext } from './exerciseCreditsContext';
import type { Exercise } from './types';

const bench: Exercise = {
  id: 'bench',
  name: 'Bench Press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest / Triceps',
  equipment: 'Barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
  partial_sets_enabled: true,
  muscle_set_credits: [
    { muscle_name: 'Pectorals', sets: 1 },
    { muscle_name: 'Triceps', sets: 0.5 },
  ],
};
const exercises = Array.from({ length: 23 }, (_, index) => ({
  ...bench,
  id: `exercise-${index}`,
  name: `Exercise ${String(index).padStart(2, '0')}`,
}));
let root: Root, host: HTMLDivElement;
const open = vi.fn();
const click = async (element: Element) => act(async () => (element as HTMLElement).click());
const button = (label: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(api, 'exerciseLibrary').mockResolvedValue([]);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  open.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const emptyLibrary = { summaries: [], loading: false, error: false, retry: () => {} };
async function render(items = exercises) {
  await act(async () =>
    root.render(<ExerciseLibraryList exercises={items} library={emptyLibrary} onOpen={open} />),
  );
}
it('defaults to ten, paginates without duplicates, and resets when page size or filters change', async () => {
  await render();
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(10);
  expect(host.textContent).toContain('Page 1 of 3');
  await click(button('Next exercises page'));
  expect(host.querySelector('[data-exercise-id]')?.getAttribute('data-exercise-id')).toBe(
    'exercise-10',
  );
  await click(button('Next exercises page'));
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(3);
  expect(button('Next exercises page').disabled).toBe(true);
  await click(host.querySelector('[aria-label="Muscle group"] button:nth-child(2)')!);
  expect(host.textContent).toContain('Page 1 of 3');
  await click(button('Exercise list options'));
  const select = document.querySelector<HTMLSelectElement>('[aria-label="Exercises per page"]')!;
  expect(select.value).toBe('10');
  await act(async () => {
    select.value = '20';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(20);
  expect(host.textContent).toContain('Page 1 of 2');
  await click(document.querySelector('[aria-label="Close Exercise list"]')!);
  await click(button('Next exercises page'));
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(3);
});
it('filters by actual direct and half-set credits instead of compound labels, and opens help separately', async () => {
  const curl = {
    ...bench,
    id: 'curl',
    name: 'Curl',
    muscle_group: 'Arms',
    muscle_set_credits: [{ muscle_name: 'Biceps', sets: 1 }],
  };
  await render([bench, curl]);
  const filters = [
    ...host.querySelectorAll<HTMLButtonElement>('[aria-label="Muscle group"] button'),
  ];
  expect(filters.map((item) => item.textContent)).toEqual([
    'All',
    'Biceps',
    'Pectorals',
    'Triceps',
  ]);
  await click(filters.find((item) => item.textContent === 'Triceps')!);
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(1);
  await click(button('Muscle set credits for Bench Press'));
  expect(open).not.toHaveBeenCalled();
  expect(document.querySelector('dialog')?.textContent).toContain('0.5 sets');
  await click(document.querySelector('[aria-label="Close Bench Press"]')!);
  await click(host.querySelector('[data-exercise-id="bench"]')!);
  expect(open).toHaveBeenCalledExactlyOnceWith('bench');
});
it('clamps the last page when a catalogue shrinks', async () => {
  await render();
  await click(button('Next exercises page'));
  await click(button('Next exercises page'));
  await render(exercises.slice(0, 12));
  expect(host.textContent).toContain('Page 2 of 2');
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(2);
});
it('saves partial credits, shows failure without changing the switch, and retries with direct credits intact', async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error('Offline'))
    .mockImplementation(async (_id, enabled) => ({
      ...bench,
      partial_sets_enabled: enabled,
      default_muscle_set_credits: bench.muscle_set_credits,
      muscle_set_credits: enabled
        ? bench.muscle_set_credits
        : bench.muscle_set_credits!.slice(0, 1),
    }));
  function Harness() {
    const [items, setItems] = useState([bench]);
    return (
      <ExerciseCreditsContext.Provider
        value={{
          exercises: items,
          updatePartialSets: async (id, enabled) => {
            const result = await save(id, enabled);
            setItems([result]);
            return result;
          },
        }}
      >
        <ExerciseLibraryList exercises={items} library={emptyLibrary} onOpen={open} />
      </ExerciseCreditsContext.Provider>
    );
  }
  await act(async () => root.render(<Harness />));
  await click(button('Muscle set credits for Bench Press'));
  const toggle = () => document.querySelector<HTMLInputElement>('[role="switch"]')!;
  await click(toggle());
  expect(toggle().checked).toBe(true);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Could not save');
  await click(toggle());
  expect(toggle().checked).toBe(false);
  expect(document.querySelector('dialog')?.textContent).toContain('Off');
  expect(document.querySelector('dialog')?.textContent).toContain('1 set');
  await click(toggle());
  expect(toggle().checked).toBe(true);
  expect(document.querySelector('dialog')?.textContent).toContain('0.5 sets');
});

it('keeps another account’s shared exercise credits read-only', async () => {
  const save = vi.fn();
  await act(async () =>
    root.render(
      <ExerciseCreditsContext.Provider value={{ exercises: [bench], updatePartialSets: save }}>
        <ExerciseMuscleHelp exercise={{ ...bench, id: 'shared-bench' }} />
      </ExerciseCreditsContext.Provider>,
    ),
  );
  await click(button('Muscle set credits for Bench Press'));
  expect(document.querySelector('dialog')?.textContent).toContain('0.5 sets');
  expect(document.querySelector('[role="switch"]')).toBeNull();
  expect(save).not.toHaveBeenCalled();
});
