// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { MachinePhotoMergePicker } from './MachinePhotoMergePicker';
import type { MachinePhotoUsage } from './types';

vi.mock('./api', () => ({ api: { mergeMachinePhotos: vi.fn() } }));

const photos: MachinePhotoUsage[] = ['Home press', 'Same press', 'Travel press'].map(
  (caption, i) => ({
    id: `machine-${i}`,
    exercise_id: 'press',
    exercise_name: 'Leg Press',
    caption,
    full_url: `/photos/${i}`,
    thumbnail_url: `/thumbnails/${i}`,
    width: 64,
    height: 48,
    created_at: '2026-10-01T10:00:00Z',
    workout_count: 0,
    last_used_date: null,
  }),
);
let container: HTMLDivElement;
let root: Root;
const onMerged = vi.fn();
const onCancel = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <MachinePhotoMergePicker
        exerciseId="press"
        photos={photos}
        onMerged={onMerged}
        onCancel={onCancel}
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function button(text: string) {
  const found = [...container.querySelectorAll('button')].find((item) => item.textContent === text);
  expect(found, text).toBeDefined();
  return found!;
}
async function click(element: Element) {
  await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}
async function select(index: number) {
  await click(container.querySelectorAll('.machine-merge-grid button')[index]);
}

function submitButton() {
  return container.querySelector<HTMLButtonElement>('.machine-merge-submit')!;
}

it('enables Merge only for two or more selected photos and toggles select-all and cancel', async () => {
  expect(container.textContent).toContain('Select duplicates');
  expect(submitButton().disabled).toBe(true);
  await select(0);
  expect(container.textContent).toContain('1 selected');
  expect(submitButton().disabled).toBe(true);
  await select(1);
  expect(submitButton().disabled).toBe(false);
  expect(submitButton().textContent).toBe('Merge 2');
  await select(0);
  expect(submitButton().disabled).toBe(true);
  await click(button('Select all'));
  expect(submitButton().textContent).toBe('Merge 3');
  await click(button('Deselect all'));
  expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
  await click(button('Cancel'));
  expect(onCancel).toHaveBeenCalledOnce();
});

it('defaults the cover to the first machine tapped and keeps a typed name when the cover changes', async () => {
  await select(2);
  await select(0);
  await click(submitButton());
  const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
  expect(radios[0].checked).toBe(true);
  expect(container.querySelector('.chosen strong')?.textContent).toBe('Travel press');
  const name = container.querySelector<HTMLInputElement>('input[maxlength="160"]')!;
  expect(name.value).toBe('Travel press');
  await click(radios[1]);
  expect(name.value).toBe('Home press');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      name,
      'Leg press',
    );
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(radios[0]);
  expect(name.value).toBe('Leg press');
  expect(container.querySelector('.chosen .machine-merge-cover')).not.toBeNull();
});

it('steps back from review and leaves selection mode with Escape', async () => {
  await select(0);
  await select(1);
  await click(submitButton());
  const escape = () =>
    act(async () =>
      container
        .querySelector('section')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
  await escape();
  expect(container.querySelector('form')).toBeNull();
  expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(2);
  expect(onCancel).not.toHaveBeenCalled();
  await escape();
  expect(onCancel).toHaveBeenCalledOnce();
});

it('reviews only selected machines, chooses the retained setup and submits an edited name', async () => {
  const merged = { ...photos[1], caption: 'Combined press' };
  vi.mocked(api.mergeMachinePhotos).mockResolvedValue(merged);
  await select(0);
  await select(1);
  await click(submitButton());
  expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(2);
  expect(container.textContent).not.toContain('Travel press');
  await click(container.querySelectorAll('input[type="radio"]')[1]);
  const name = container.querySelector<HTMLInputElement>('input[maxlength="160"]')!;
  expect(name.value).toBe('Same press');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      name,
      ' Combined press ',
    );
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(api.mergeMachinePhotos).toHaveBeenCalledWith(
    'press',
    ['machine-0', 'machine-1'],
    'machine-1',
    'Combined press',
  );
  expect(onMerged).toHaveBeenCalledWith(merged, ['machine-0', 'machine-1']);
});

it('keeps selection after an error, allows retry and prevents duplicate in-flight merges', async () => {
  let resolve!: (photo: MachinePhotoUsage) => void;
  vi.mocked(api.mergeMachinePhotos).mockRejectedValueOnce(new Error('Could not merge.'));
  await select(0);
  await select(1);
  await click(submitButton());
  const submit = () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await act(async () => {
    submit();
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Could not merge.');
  expect(onMerged).not.toHaveBeenCalled();
  vi.mocked(api.mergeMachinePhotos).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await act(async () => {
    submit();
    submit();
  });
  expect(api.mergeMachinePhotos).toHaveBeenCalledTimes(2);
  expect(button('Merging…').closest('fieldset')?.disabled).toBe(true);
  await act(async () => resolve(photos[0]));
  expect(onMerged).toHaveBeenCalledOnce();
});

it('returns from review with its previous multi-selection intact', async () => {
  await select(0);
  await select(2);
  await click(submitButton());
  await click(button('Back'));
  expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(2);
  expect(api.mergeMachinePhotos).not.toHaveBeenCalled();
});
