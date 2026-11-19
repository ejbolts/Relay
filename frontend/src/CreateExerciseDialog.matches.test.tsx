// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CreateExerciseDialog } from './CreateExerciseDialog';
import type { Exercise, WorkoutCategory } from './types';

const bench: Exercise = {
  id: 'db-bench',
  name: 'Dumbbell Bench Press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Dumbbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
  muscle_set_credits: [{ muscle_name: 'Pectorals', sets: 1 }],
};
const squat: Exercise = { ...bench, id: 'squat', name: 'Back Squat', category: 'lower' };
const categoryLabels: Record<WorkoutCategory, string> = {
  upper: 'Upper body',
  lower: 'Lower body',
  push: 'Push',
  pull: 'Pull',
  full_body: 'Full body',
  cardio: 'Cardio',
  other: 'Other',
};

let root: Root;
let host: HTMLDivElement;
const onCreate = vi.fn();
const onCreated = vi.fn();

beforeEach(() => {
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
  onCreate.mockReset().mockResolvedValue({ ...bench, id: 'new' });
  onCreated.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function open(initialName: string, onUseExisting?: (exercise: Exercise) => void) {
  await act(async () =>
    root.render(
      <CreateExerciseDialog
        exercises={[bench, squat]}
        categoryLabels={categoryLabels}
        initialName={initialName}
        initialCategory="push"
        viewportHeight={844}
        viewportTop={0}
        onCreate={onCreate}
        onCreated={onCreated}
        onUseExisting={onUseExisting}
        onClose={vi.fn()}
      />,
    ),
  );
}

const nameInput = () => document.querySelector<HTMLInputElement>('[placeholder="Exercise name"]')!;
const matches = () =>
  [...document.querySelectorAll('.create-exercise-match')].map((item) => item.textContent);

async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      nameInput(),
      value,
    );
    nameInput().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit() {
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}

it('suggests a near-duplicate while typing and uses it instead of adding one', async () => {
  const onUseExisting = vi.fn();
  await open('', onUseExisting);
  expect(matches()).toEqual([]);
  await type('DB Bench');
  expect(matches()).toEqual(['Use Dumbbell Bench Press']);
  expect(document.querySelector('.create-exercise-duplicate')).toBeNull();
  await act(async () =>
    document.querySelector<HTMLButtonElement>('.create-exercise-match')!.click(),
  );
  expect(onUseExisting).toHaveBeenCalledWith(bench);
  expect(onCreate).not.toHaveBeenCalled();
});

it('flags an exact duplicate beside the name and does not submit it', async () => {
  await open('dumbbell bench press ');
  expect(document.querySelector('.create-exercise-duplicate')?.textContent).toBe(
    'Already in your library',
  );
  expect(nameInput().getAttribute('aria-invalid')).toBe('true');
  expect(nameInput().getAttribute('aria-describedby')).toBe(
    document.querySelector('.create-exercise-duplicate')!.id,
  );
  await act(async () => {
    const select = document.querySelector<HTMLSelectElement>('[aria-label="Target muscle 1"]')!;
    select.value = 'Pectorals';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await submit();
  expect(onCreate).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(document.activeElement).toBe(nameInput());
});

it('hands a picked exercise to onCreated when there is no separate handler', async () => {
  await open('Dumbbell bench');
  await act(async () =>
    document.querySelector<HTMLButtonElement>('.create-exercise-match')!.click(),
  );
  expect(onCreated).toHaveBeenCalledWith(bench);
  expect(onCreate).not.toHaveBeenCalled();
});

it('still adds a genuinely new exercise without suggestions', async () => {
  await open('Zercher Squat');
  expect(matches()).toEqual([]);
  await act(async () => {
    const select = document.querySelector<HTMLSelectElement>('[aria-label="Target muscle 1"]')!;
    select.value = 'Pectorals';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await submit();
  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Zercher Squat' }));
});
