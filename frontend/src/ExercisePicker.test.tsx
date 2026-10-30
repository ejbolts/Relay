// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExercisePicker } from './App';
import type { Exercise } from './types';

const cable: Exercise = {
  id: 'cable',
  name: 'Cable Biceps Curl',
  equipment: 'Cable',
  muscle_group: 'Biceps',
  category: 'pull',
  kind: 'strength',
  is_custom: false,
  is_favorite: true,
  muscle_contributions: [],
};
const exercises: Exercise[] = [
  cable,
  {
    ...cable,
    id: 'db',
    name: 'Dumbbell Curl',
    equipment: 'Dumbbell',
    is_favorite: false,
    is_custom: true,
  },
  { ...cable, id: 'single', name: 'Single-Arm Cable Biceps Curl', is_favorite: false },
  {
    ...cable,
    id: 'push',
    name: 'Cable Triceps Pushdown',
    category: 'push',
    muscle_group: 'Triceps',
  },
];
let root: Root, host: HTMLDivElement;
const onChoose = vi.fn();

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLElement.prototype.scrollTo = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  onChoose.mockReset();
  await act(async () =>
    root.render(
      <ExercisePicker
        exercises={exercises}
        excludedIds={['single']}
        recentExerciseIds={['cable', 'db']}
        onChoose={onChoose}
        onClose={vi.fn()}
        onFavoriteChange={vi.fn()}
        onCreateExercise={vi.fn()}
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function setValue(selector: string, value: string) {
  const field = document.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
  await act(async () => {
    const prototype =
      field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(
      new Event(field instanceof HTMLInputElement ? 'input' : 'change', { bubbles: true }),
    );
  });
}
const names = () =>
  [...document.querySelectorAll('.exercise-option strong')].map((item) => item.textContent);

it('combines equipment, category, favourites and search instead of bypassing filters', async () => {
  await setValue('[aria-label="Equipment"]', 'Cable');
  await setValue('[aria-label="Body part"]', 'pull');
  await setValue('[aria-label="Exercise category"]', 'favorites');
  await setValue('.exercise-search', 'bicep curl');
  expect(names()).toEqual(['Cable Biceps Curl']);
  await setValue('[aria-label="Equipment"]', 'Dumbbell');
  expect(names()).toEqual([]);
  expect(document.querySelector('.muted-empty')?.textContent).toContain('No exercises match');
  await setValue('[aria-label="Exercise category"]', 'recent');
  expect(names()).toEqual(['Dumbbell Curl']);
  await setValue('[aria-label="Body part"]', 'push');
  expect(names()).toEqual([]);
});

it('retains a chosen variant across filter changes and submits its own ID', async () => {
  await setValue('.exercise-search', 'db bicep curl');
  expect(names()).toEqual(['Dumbbell Curl']);
  await act(async () =>
    document.querySelector<HTMLButtonElement>('.exercise-option-select')!.click(),
  );
  await setValue('[aria-label="Equipment"]', 'Cable');
  await setValue('.exercise-search', '');
  expect(names()).not.toContain('Single-Arm Cable Biceps Curl');
  const add = document.querySelector<HTMLButtonElement>('.add-selected-button')!;
  await act(async () => add.click());
  expect(onChoose).toHaveBeenCalledWith([exercises[1]]);
});

it('filters custom exercises independently of category, equipment and search', async () => {
  const custom = document.querySelector<HTMLButtonElement>('[aria-label="Custom exercises"]')!;
  await act(async () => custom.click());
  expect(names()).toEqual(['Dumbbell Curl']);
  await setValue('[aria-label="Equipment"]', 'Dumbbell');
  await setValue('[aria-label="Body part"]', 'pull');
  await setValue('.exercise-search', 'bicep curl');
  expect(names()).toEqual(['Dumbbell Curl']);
  await setValue('[aria-label="Exercise category"]', 'favorites');
  expect(names()).toEqual([]);
  await setValue('[aria-label="Exercise category"]', 'all');
  await setValue('[aria-label="Equipment"]', 'Cable');
  expect(names()).toEqual([]);
  await act(async () => custom.click());
  expect(custom.getAttribute('aria-pressed')).toBe('false');
  expect(names()).toEqual(['Cable Biceps Curl']);
});
