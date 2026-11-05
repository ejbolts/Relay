// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { ExerciseMergeDialog } from './ExerciseMergeDialog';
import type { Exercise } from './types';

const official: Exercise = {
  id: 'official',
  name: 'Barbell Bench Press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const custom = { ...official, id: 'custom', name: 'My bench', is_custom: true };
const other = { ...custom, id: 'other', name: 'Custom press' };
const cardio = { ...custom, id: 'cardio', name: 'My run', kind: 'cardio' as const };
let root: Root, host: HTMLDivElement;
const merged = vi.fn(),
  close = vi.fn();
const click = async (element: Element) => act(async () => (element as HTMLElement).click());
const submit = () => document.querySelector<HTMLButtonElement>('[type="submit"]')!;
async function source(id: string) {
  await act(async () => {
    const select = document.querySelector('select')!;
    select.value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function search(value: string) {
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>('[type="search"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const destination = (name: string) =>
  [...document.querySelectorAll('.exercise-merge-targets label')].find((label) =>
    label.textContent?.includes(name),
  )!;
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  merged.mockReset();
  close.mockReset();
  await act(async () =>
    root.render(
      <ExerciseMergeDialog
        exercises={[official, custom, other, cardio]}
        onMerged={merged}
        onClose={close}
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('allows only custom sources, matching kinds, and reviews the chosen destination before merging', async () => {
  const merge = vi.spyOn(api, 'mergeExercise').mockResolvedValue(official);
  expect([...document.querySelectorAll('option')].map((x) => x.value)).not.toContain('official');
  expect(submit().disabled).toBe(true);
  await source('custom');
  expect(document.querySelector('.exercise-merge-targets')?.textContent).not.toContain('My run');
  expect(document.querySelector('.exercise-merge-targets')?.textContent).not.toContain('My bench');
  expect(submit().disabled).toBe(true);
  await search('bench');
  await click(destination('Barbell Bench Press'));
  expect(document.querySelector('[aria-label="Merge review"]')?.textContent).toContain(
    'cannot be undone',
  );
  expect(merge).not.toHaveBeenCalled();
  await click(submit());
  expect(merge).toHaveBeenCalledExactlyOnceWith('custom', 'official');
  expect(merged).toHaveBeenCalledWith('custom', official);
});

it('resets the destination when changing source and supports another custom exercise', async () => {
  const merge = vi.spyOn(api, 'mergeExercise').mockResolvedValue(other);
  await source('custom');
  await click(destination('Custom press'));
  await source('cardio');
  expect(submit().disabled).toBe(true);
  expect(document.querySelector('.exercise-merge-targets')?.textContent).toContain(
    'No matching cardio exercises',
  );
  await source('custom');
  await search('nonsense');
  expect(document.querySelector('.exercise-merge-targets')?.textContent).toContain(
    'No matching strength exercises',
  );
  await search('');
  await click(destination('Custom press'));
  await click(submit());
  expect(merge).toHaveBeenCalledWith('custom', 'other');
});

it('preserves choices on failure, retries, and prevents repeat submission or closing while saving', async () => {
  let finish!: (exercise: Exercise) => void;
  const merge = vi
    .spyOn(api, 'mergeExercise')
    .mockRejectedValueOnce(new Error('Please try again'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  await source('custom');
  await click(destination('Barbell Bench Press'));
  await click(submit());
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Please try again');
  await click(submit());
  await click(submit());
  await click(document.querySelector('[aria-label="Close Merge exercises"]')!);
  expect(merge).toHaveBeenCalledTimes(2);
  expect(close).not.toHaveBeenCalled();
  expect(merged).not.toHaveBeenCalled();
  await act(async () => finish(official));
  expect(merged).toHaveBeenCalledOnce();
});

it('cancels without changing exercises', async () => {
  const merge = vi.spyOn(api, 'mergeExercise');
  await source('custom');
  await click(destination('Barbell Bench Press'));
  await click([...document.querySelectorAll('button')].find((x) => x.textContent === 'Cancel')!);
  expect(close).toHaveBeenCalledOnce();
  expect(merge).not.toHaveBeenCalled();
});
