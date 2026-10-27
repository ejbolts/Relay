// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CreateExerciseDialog } from './CreateExerciseDialog';
import type { Exercise, WorkoutCategory } from './types';

const exercise: Exercise = {
  id: 'press',
  name: 'Press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: null,
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
  muscle_set_credits: [
    { muscle_name: 'Pectorals', sets: 1 },
    { muscle_name: 'Triceps', sets: 0.5 },
  ],
};
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
  onCreate.mockReset().mockResolvedValue(exercise);
  onCreated.mockReset();
  await act(async () =>
    root.render(
      <CreateExerciseDialog
        exercises={[
          exercise,
          {
            ...exercise,
            id: 'cardio',
            kind: 'cardio',
            muscle_group: 'Full body',
            muscle_set_credits: [],
          },
        ]}
        categoryLabels={categoryLabels}
        initialName="Custom press"
        initialCategory="push"
        viewportHeight={844}
        viewportTop={0}
        onCreate={onCreate}
        onCreated={onCreated}
        onClose={vi.fn()}
      />,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function control(label: string) {
  const named = document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (named) return named;
  const element = [...document.querySelectorAll('label')].find(
    (item) => item.firstChild?.textContent === label,
  );
  return element!.querySelector('select')!;
}

async function select(label: string, value: string) {
  await act(async () => {
    const element = control(label);
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function submit() {
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}

it('offers the muscles used in weekly totals and saves partial credit', async () => {
  expect([...control('Target muscle 1').options].map((option) => option.value)).toEqual([
    '',
    'Pectorals',
    'Triceps',
  ]);
  await select('Target muscle 1', 'Triceps');
  await select('Credit per working set 1', '0.5');
  await submit();
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      muscle_group: 'Triceps',
      muscle_set_credits: [{ muscle_name: 'Triceps', sets: 0.5 }],
    }),
  );
  expect(onCreated).toHaveBeenCalledWith(exercise);
});

it('keeps direct credit as the default and preserves selections after a save error', async () => {
  await select('Target muscle 1', 'Pectorals');
  onCreate.mockRejectedValueOnce(new Error('Please try again.'));
  await submit();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Please try again.');
  expect(control('Target muscle 1').value).toBe('Pectorals');
  expect(control('Credit per working set 1').value).toBe('1');
  await submit();
  expect(onCreate).toHaveBeenLastCalledWith(
    expect.objectContaining({ muscle_set_credits: [{ muscle_name: 'Pectorals', sets: 1 }] }),
  );
});

it('hides and omits strength credit for cardio and restores it when returning to strength', async () => {
  await select('Target muscle 1', 'Triceps');
  await select('Credit per working set 1', '0.5');
  await select('Type', 'cardio');
  expect(document.querySelector('[aria-label="Target muscles"]')).toBeNull();
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>('input[placeholder="e.g. Lats"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'Full body',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await submit();
  expect(onCreate.mock.calls[0][0]).not.toHaveProperty('muscle_set_credits');
  await select('Type', 'strength');
  expect(control('Credit per working set 1').value).toBe('0.5');
  await select('Category', 'cardio');
  expect(document.querySelector('[aria-label="Target muscles"]')).toBeNull();
});

async function clickButton(name: string) {
  const button = [...document.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === name || item.textContent === name,
  )!;
  await act(async () => button.click());
}

it('adds independent targets, prevents duplicate choices, and removes only the chosen target', async () => {
  await select('Target muscle 1', 'Pectorals');
  await clickButton('+ Add muscle');
  expect([...control('Target muscle 2').options].map((option) => option.value)).toEqual([
    '',
    'Triceps',
  ]);
  await select('Target muscle 2', 'Triceps');
  await select('Credit per working set 2', '0.5');
  await submit();
  expect(onCreate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      muscle_set_credits: [
        { muscle_name: 'Pectorals', sets: 1 },
        { muscle_name: 'Triceps', sets: 0.5 },
      ],
    }),
  );
  await clickButton('Remove muscle 1');
  expect(control('Target muscle 1').value).toBe('Triceps');
  expect(control('Credit per working set 1').value).toBe('0.5');
  expect(
    (document.querySelector('[aria-label="Remove muscle 1"]') as HTMLButtonElement).disabled,
  ).toBe(true);
  await clickButton('+ Add muscle');
  await select('Target muscle 2', 'Pectorals');
  expect(control('Credit per working set 2').value).toBe('1');
});

it('requires every added row to have a target and keeps mixed credits after a save error', async () => {
  await select('Target muscle 1', 'Pectorals');
  await clickButton('+ Add muscle');
  await submit();
  expect(onCreate).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Choose a muscle');
  await select('Target muscle 2', 'Triceps');
  await select('Credit per working set 2', '0.5');
  onCreate.mockRejectedValueOnce(new Error('Please try again.'));
  await submit();
  expect(control('Target muscle 1').value).toBe('Pectorals');
  expect(control('Credit per working set 2').value).toBe('0.5');
});

it('tracks the visual viewport when opened outside the workout picker', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 420, offsetTop: 30 });
  vi.stubGlobal('visualViewport', viewport);
  await act(async () =>
    root.render(
      <CreateExerciseDialog
        exercises={[exercise]}
        categoryLabels={categoryLabels}
        initialName=""
        initialCategory=""
        onCreate={onCreate}
        onCreated={onCreated}
        onClose={vi.fn()}
      />,
    ),
  );
  await act(async () => viewport.dispatchEvent(new Event('resize')));
  const dialog = document.querySelector('dialog')!;
  expect(dialog.style.getPropertyValue('--create-exercise-viewport-height')).toBe('420px');
  expect(dialog.style.getPropertyValue('--create-exercise-viewport-top')).toBe('30px');
  viewport.height = 700;
  viewport.offsetTop = 0;
  await act(async () => window.dispatchEvent(new Event('resize')));
  expect(dialog.style.getPropertyValue('--create-exercise-viewport-height')).toBe('700px');
});
