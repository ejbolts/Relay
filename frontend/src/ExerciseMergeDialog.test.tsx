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
        exercises={[
          official,
          custom,
          other,
          cardio,
          { ...official, id: 'dumbbell', name: 'Dumbbell press', equipment: 'Dumbbell' },
          { ...official, id: 'squat', name: 'Squat', muscle_group: 'Quads' },
        ]}
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
  // Exercises that already match come first; the rest say they need changes.
  expect(
    [...document.querySelectorAll('.exercise-merge-targets label')].map((label) => [
      label.querySelector('strong')?.textContent,
      label.querySelector('.exercise-merge-tag')?.textContent ?? null,
    ]),
  ).toEqual([
    ['Barbell Bench Press', null],
    ['Custom press', null],
    ['Dumbbell press', 'Needs changes'],
    ['Squat', 'Needs changes'],
  ]);
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
    'No other exercises of this kind.',
  );
  await source('custom');
  await search('nonsense');
  expect(document.querySelector('.exercise-merge-targets')?.textContent).toContain(
    'No exercises match your search.',
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

it('shows what a custom exercise must change, applies it, then allows the merge', async () => {
  const dumbbell = {
    ...official,
    id: 'dumbbell',
    name: 'Dumbbell press',
    equipment: 'Dumbbell',
    default_muscle_set_credits: [
      { muscle_name: 'Pectorals', sets: 1 },
      { muscle_name: 'Triceps', sets: 0.5 },
    ],
  };
  const changed = vi.fn();
  await act(async () =>
    root.render(
      <ExerciseMergeDialog
        exercises={[custom, dumbbell]}
        onMerged={merged}
        onChanged={changed}
        onClose={close}
      />,
    ),
  );
  const updated = {
    ...custom,
    equipment: 'Dumbbell',
    muscle_group: 'Pectorals',
    default_muscle_set_credits: dumbbell.default_muscle_set_credits,
  };
  const update = vi.spyOn(api, 'updateExercise').mockResolvedValue(updated);
  const merge = vi.spyOn(api, 'mergeExercise').mockResolvedValue(dumbbell);

  await source('custom');
  await click(destination('Dumbbell press'));
  const guide = document.querySelector('[aria-label="Changes needed to merge"]')!;
  expect(guide.querySelector('h3')?.textContent).toBe('My bench must match Dumbbell press');
  expect(
    [...guide.querySelectorAll('dl > div')].map((row) => [
      row.querySelector('dt')?.textContent,
      row.querySelector('s')?.textContent,
      row.querySelector('dd span')?.textContent,
    ]),
  ).toEqual([
    ['Equipment', 'Barbell', 'Dumbbell'],
    ['Muscles', 'Chest', 'Pectorals, Triceps ½'],
  ]);
  expect(document.querySelector('[aria-label="Merge review"]')).toBeNull();
  expect(submit().disabled).toBe(true);

  await click(
    [...guide.querySelectorAll('button')].find((x) => x.textContent === 'Change My bench')!,
  );
  expect(update).toHaveBeenCalledExactlyOnceWith('custom', {
    equipment: 'Dumbbell',
    muscle_set_credits: [
      { muscle_name: 'Pectorals', sets: 1 },
      { muscle_name: 'Triceps', sets: 0.5 },
    ],
  });
  expect(changed).toHaveBeenCalledWith(updated);
  // The same destination is now ready, with the usual review before merging.
  expect(document.querySelector('[aria-label="Changes needed to merge"]')).toBeNull();
  expect(document.querySelector('.exercise-merge-tag')).toBeNull();
  expect(document.querySelector('[aria-label="Merge review"]')?.textContent).toContain(
    'cannot be undone',
  );
  expect(merge).not.toHaveBeenCalled();
  await click(submit());
  expect(merge).toHaveBeenCalledExactlyOnceWith('custom', 'dumbbell');
});

it('keeps the guidance and choices when the change fails', async () => {
  vi.spyOn(api, 'updateExercise').mockRejectedValueOnce(new Error('Please try again'));
  await source('custom');
  await click(destination('Squat'));
  const guide = () => document.querySelector('[aria-label="Changes needed to merge"]')!;
  expect(guide().querySelector('dt')?.textContent).toBe('Muscles');
  await click(
    [...guide().querySelectorAll('button')].find((x) => x.textContent === 'Change My bench')!,
  );
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Please try again');
  expect(guide()).not.toBeNull();
  expect(submit().disabled).toBe(true);
});

it('lists likely standard exercises first under Suggested until a search is typed', async () => {
  await source('custom');
  const headings = () =>
    [...document.querySelectorAll('.exercise-merge-group')].map((item) => item.textContent);
  expect(headings()).toEqual(['Suggested', 'All exercises']);
  const suggestion = document.querySelector('.exercise-merge-group + label')!;
  expect(suggestion.querySelector('strong')?.textContent).toBe('Barbell Bench Press');
  expect(suggestion.querySelector('.exercise-search-match')?.textContent).toBe('Bench');
  // A suggestion is not listed twice.
  expect(
    [...document.querySelectorAll('.exercise-merge-targets strong')].filter(
      (item) => item.textContent === 'Barbell Bench Press',
    ),
  ).toHaveLength(1);
  await search('press');
  expect(headings()).toEqual([]);
});

it('starts with the destination it was opened for', async () => {
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () =>
    root.render(
      <ExerciseMergeDialog
        exercises={[official, custom]}
        initialSourceId="custom"
        initialTargetId="official"
        onMerged={merged}
        onClose={close}
      />,
    ),
  );
  expect(destination('Barbell Bench Press').querySelector('input')?.checked).toBe(true);
  expect(document.querySelector('[aria-label="Merge review"]')?.textContent).toContain(
    'Barbell Bench Press',
  );
  expect(submit().disabled).toBe(false);
});
