// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RoutineExerciseSearch } from './RoutineExerciseSearch';
import type { Exercise } from './types';

const base: Exercise = {
  id: 'bench',
  name: 'Barbell Bench Press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const exercises: Exercise[] = [
  base,
  { ...base, id: 'curl', name: 'Band Biceps Curl', muscle_group: 'Biceps', equipment: 'Band' },
  { ...base, id: 'squat', name: 'Back Squat', muscle_group: 'Quads' },
  { ...base, id: 'pushdown', name: 'Cable Tricep Pushdown', muscle_group: 'Triceps' },
];

let root: Root;
let host: HTMLDivElement;
const onAdd = vi.fn();

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  onAdd.mockReset();
  await act(async () =>
    root.render(
      <RoutineExerciseSearch day={1} exercises={exercises} disabled={false} onAdd={onAdd} />,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const searchBox = () =>
  host.querySelector<HTMLInputElement>('[aria-label="Search exercises to add to day 1"]');
const optionNames = () =>
  [...host.querySelectorAll('[role="option"] strong')].map((option) => option.textContent);

async function openSearch() {
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Add exercise to day 1"]')!.click(),
  );
}

async function type(value: string) {
  await act(async () => {
    const input = searchBox()!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function key(name: string) {
  await act(async () =>
    searchBox()!.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true })),
  );
}

it('opens a search with every exercise and narrows it with fuzzy matching', async () => {
  expect(searchBox()).toBeNull();
  await openSearch();
  expect(optionNames()).toEqual([
    'Back Squat',
    'Band Biceps Curl',
    'Barbell Bench Press',
    'Cable Tricep Pushdown',
  ]);

  await type('bnch prss');
  expect(optionNames()).toEqual(['Barbell Bench Press']);

  await type('tricep push');
  expect(optionNames()).toEqual(['Cable Tricep Pushdown']);
  expect(host.querySelectorAll('.exercise-search-match').length).toBeGreaterThan(0);
});

it('leaves hidden exercises out of the search', async () => {
  await act(async () =>
    root.render(
      <RoutineExerciseSearch
        day={1}
        exercises={exercises.map((item) =>
          item.id === 'squat' ? { ...item, hidden: true } : item,
        )}
        disabled={false}
        onAdd={onAdd}
      />,
    ),
  );
  await openSearch();
  expect(optionNames()).not.toContain('Back Squat');
  expect(optionNames()).toHaveLength(3);
});

it('adds the highlighted match from the keyboard and collapses the search', async () => {
  await openSearch();
  await type('b');
  await key('ArrowDown');
  const second = host.querySelectorAll('[role="option"]')[1];
  expect(second.getAttribute('aria-selected')).toBe('true');
  await key('Enter');
  const name = second.querySelector('strong')?.textContent;
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name }));
  expect(searchBox()).toBeNull();
});

it('adds a tapped match and explains when nothing matches', async () => {
  await openSearch();
  await type('zzz');
  expect(host.querySelector('[role="status"]')?.textContent).toBe('No exercises match “zzz”.');
  await type('squat');
  await act(async () => host.querySelector<HTMLButtonElement>('[role="option"]')!.click());
  expect(onAdd).toHaveBeenCalledWith(exercises[2]);
});

it('closes with Escape without adding an exercise', async () => {
  await openSearch();
  await type('curl');
  await key('Escape');
  expect(searchBox()).toBeNull();
  expect(onAdd).not.toHaveBeenCalled();
});
