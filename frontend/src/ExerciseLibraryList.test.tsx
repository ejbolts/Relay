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
const PAGE_SIZE_KEY = 'relay-exercise-list-page-size';
beforeEach(() => {
  // Five a page keeps the paging tests short; the default has its own test.
  localStorage.setItem(PAGE_SIZE_KEY, '5');
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
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const emptyLibrary = { summaries: [], loading: false, error: false, retry: () => {} };
it('opens exercise merging from list options when available', async () => {
  const onMerge = vi.fn();
  await act(async () =>
    root.render(
      <ExerciseLibraryList
        exercises={exercises}
        library={emptyLibrary}
        onOpen={open}
        onMerge={onMerge}
      />,
    ),
  );
  await click(button('Exercise list options'));
  await click(
    [...document.querySelectorAll('dialog button')].find(
      (item) => item.textContent === 'Merge exercises',
    )!,
  );
  expect(onMerge).toHaveBeenCalledOnce();
  expect(document.querySelector('dialog')).toBeNull();
});
async function render(items = exercises) {
  await act(async () =>
    root.render(<ExerciseLibraryList exercises={items} library={emptyLibrary} onOpen={open} />),
  );
}
it('shows ten a page until another size is chosen, and remembers the choice', async () => {
  localStorage.clear();
  await render();
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(10);
  expect(host.textContent).toContain('Page 1 of 3');
  await click(button('Exercise list options'));
  const select = document.querySelector<HTMLSelectElement>('[aria-label="Exercises per page"]')!;
  expect(select.value).toBe('10');
  await act(async () => {
    select.value = '20';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(20);
  expect(localStorage.getItem(PAGE_SIZE_KEY)).toBe('20');
  // Opening the list again starts from the remembered size.
  await act(async () => root.render(<div />));
  await render();
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(20);
  // A stored value that is not one of the sizes falls back to the default.
  localStorage.setItem(PAGE_SIZE_KEY, '7');
  await act(async () => root.render(<div />));
  await render();
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(10);
});
it('paginates without duplicates, and resets when page size or filters change', async () => {
  await render();
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(5);
  expect(host.textContent).toContain('Page 1 of 5');
  await click(button('Next exercises page'));
  expect(host.querySelector('[data-exercise-id]')?.getAttribute('data-exercise-id')).toBe(
    'exercise-5',
  );
  for (let page = 3; page <= 5; page += 1) await click(button('Next exercises page'));
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(3);
  expect(button('Next exercises page').disabled).toBe(true);
  await click(host.querySelector('[aria-label="Muscle group"] button:nth-child(2)')!);
  expect(host.textContent).toContain('Page 1 of 5');
  await click(button('Exercise list options'));
  const select = document.querySelector<HTMLSelectElement>('[aria-label="Exercises per page"]')!;
  expect(select.value).toBe('5');
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
it('filters equipment from list options and marks the filter button', async () => {
  await render([
    ...exercises.slice(0, 6),
    { ...bench, id: 'cable-fly', name: 'Cable Fly', equipment: 'Cable' },
  ]);
  expect(host.querySelector('[aria-label="Equipment"]')).toBeNull();
  expect(button('Exercise list options').hasAttribute('data-active')).toBe(false);
  await click(button('Exercise list options'));
  expect(document.querySelector('[aria-label="Training block"]')).toBeNull();
  const equipment = document.querySelector<HTMLSelectElement>('dialog [aria-label="Equipment"]')!;
  // Under its own Equipment label, the unfiltered choice reads "All equipment".
  expect(equipment.options[0].textContent).toBe('All equipment');
  await act(async () => {
    equipment.value = 'Cable';
    equipment.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect([...host.querySelectorAll('[data-exercise-id]')].map((item) => item.textContent)).toEqual([
    'Cable Fly',
  ]);
  const filter = host.querySelector('.exercise-list-options')!;
  expect(filter.hasAttribute('data-active')).toBe(true);
  expect(filter.getAttribute('aria-label')).toBe('Exercise list options, equipment filtered');
});
it('clamps the last page when a catalogue shrinks', async () => {
  await render();
  for (let page = 2; page <= 5; page += 1) await click(button('Next exercises page'));
  await render(exercises.slice(0, 12));
  expect(host.textContent).toContain('Page 3 of 3');
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(2);
});
it('toggles a selected muscle back to All and resets pagination', async () => {
  await render();
  const filters = [
    ...host.querySelectorAll<HTMLButtonElement>('[aria-label="Muscle group"] button'),
  ];
  const all = filters.find((item) => item.textContent === 'All')!;
  const pectorals = filters.find((item) => item.textContent === 'Pectorals')!;
  await click(pectorals);
  expect(pectorals.getAttribute('aria-pressed')).toBe('true');
  expect(all.getAttribute('aria-pressed')).toBe('false');
  await click(button('Next exercises page'));
  expect(host.textContent).toContain('Page 2 of 5');
  await click(pectorals);
  expect(pectorals.getAttribute('aria-pressed')).toBe('false');
  expect(all.getAttribute('aria-pressed')).toBe('true');
  expect(host.textContent).toContain('Page 1 of 5');
  await click(all);
  expect(all.getAttribute('aria-pressed')).toBe('true');
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(5);
});
it('restores all muscles without clearing Custom, and toggles Custom off independently', async () => {
  const curl = {
    ...bench,
    id: 'curl',
    name: 'Custom Curl',
    is_custom: true,
    muscle_set_credits: [{ muscle_name: 'Biceps', sets: 1 }],
  };
  const customPress = { ...bench, id: 'custom-press', name: 'Custom Press', is_custom: true };
  await render([bench, curl, customPress]);
  const biceps = [
    ...host.querySelectorAll<HTMLButtonElement>('[aria-label="Muscle group"] button'),
  ].find((item) => item.textContent === 'Biceps')!;
  const custom = button('Custom exercises');
  await click(custom);
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(2);
  await click(biceps);
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(1);
  await click(biceps);
  expect(custom.getAttribute('aria-pressed')).toBe('true');
  expect(
    host.querySelector('[aria-label="Muscle group"] button[aria-pressed="true"]')?.textContent,
  ).toBe('All');
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(2);
  await click(custom);
  expect(custom.getAttribute('aria-pressed')).toBe('false');
  expect(host.querySelectorAll('[data-exercise-id]')).toHaveLength(3);
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
        <ExerciseMuscleHelp exercise={items[0]} />
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

it('marks estimates converted to a reference machine', async () => {
  const library = {
    ...emptyLibrary,
    summaries: [
      {
        exercise_id: 'exercise-0',
        session_count: 2,
        last_date: '2026-11-10',
        latest_estimated_1rm: 160,
        change_kg: 4,
        change_percent: 2.6,
        trend: [],
        normalised: true,
      },
      {
        exercise_id: 'exercise-1',
        session_count: 2,
        last_date: '2026-11-09',
        latest_estimated_1rm: 100,
        change_kg: null,
        change_percent: null,
        trend: [],
      },
    ],
  };
  await act(async () =>
    root.render(
      <ExerciseLibraryList exercises={exercises.slice(0, 2)} library={library} onOpen={open} />,
    ),
  );
  const values = [...host.querySelectorAll('.exercise-list-value b')];
  expect(values.map((item) => item.textContent)).toEqual(['≈ 160 kg', '100 kg']);
  expect(values[0].getAttribute('title')).toBe('In your reference machine’s weights');
  expect(values[1].hasAttribute('title')).toBe(false);
});
