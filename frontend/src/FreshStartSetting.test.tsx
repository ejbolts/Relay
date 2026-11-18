// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { FreshStartSetting } from './FreshStartSetting';
import { TrainingBlocksProvider } from './TrainingBlocksProvider';
import { recordBadgeLabel, recordScopeLabel } from './recordScope';
import type { TrainingBlocks } from './types';
import { localDate } from './utils';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    api: {
      ...original.api,
      trainingBlocks: { ...original.api.trainingBlocks, get: vi.fn(), setFreshStart: vi.fn() },
    },
  };
});

let root: Root;
let container: HTMLDivElement;
let saved: TrainingBlocks;

const toggle = () =>
  container.querySelector<HTMLButtonElement>('[aria-label="Fresh start for personal records"]')!;
const dateInput = () => container.querySelector<HTMLInputElement>('.fresh-start-date input');

beforeEach(() => {
  saved = { blocks: [], fresh_start: null };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(api.trainingBlocks.get).mockImplementation(async () => saved);
  vi.mocked(api.trainingBlocks.setFreshStart).mockImplementation(async (value) => {
    saved = { ...saved, fresh_start: value };
    return saved;
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function render() {
  await act(async () =>
    root.render(
      <TrainingBlocksProvider>
        <FreshStartSetting />
      </TrainingBlocksProvider>,
    ),
  );
}

it('starts fresh today, changes the date when the field is left and turns off', async () => {
  await render();
  expect(toggle().getAttribute('aria-checked')).toBe('false');
  expect(dateInput()).toBeNull();

  await act(async () => toggle().click());
  expect(api.trainingBlocks.setFreshStart).toHaveBeenLastCalledWith(localDate());
  expect(toggle().getAttribute('aria-checked')).toBe('true');
  expect(dateInput()!.value).toBe(localDate());
  expect(dateInput()!.max).toBe(localDate());

  const input = dateInput()!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setValue.call(input, '2026-01-05');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Typing alone does not save; partial years would otherwise be sent.
  expect(api.trainingBlocks.setFreshStart).toHaveBeenCalledTimes(1);
  await act(async () => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(api.trainingBlocks.setFreshStart).toHaveBeenLastCalledWith('2026-01-05');
  expect(dateInput()!.value).toBe('2026-01-05');

  await act(async () => toggle().click());
  expect(api.trainingBlocks.setFreshStart).toHaveBeenLastCalledWith(null);
  expect(dateInput()).toBeNull();
});

it('shows a failed change beside the setting', async () => {
  vi.mocked(api.trainingBlocks.setFreshStart).mockRejectedValueOnce(new Error('Offline.'));
  await render();
  await act(async () => toggle().click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'Could not change the fresh start. Offline.',
  );
  expect(toggle().getAttribute('aria-checked')).toBe('false');
});

it('names records by scope, treating unscoped records as all-time', () => {
  expect(recordScopeLabel({})).toBe('All-time');
  expect(recordScopeLabel({ scope: 'fresh_start' })).toBe('Fresh start');
  expect(recordScopeLabel({ scope: 'block' })).toBe('Block');
  expect(recordBadgeLabel([{ scope: 'block' }, { scope: 'fresh_start' }])).toBe('Fresh start PR');
  expect(recordBadgeLabel([{ scope: 'block' }, { scope: 'all_time' }])).toBe('All-time PR');
  expect(recordBadgeLabel([{ scope: 'block' }])).toBe('Block PR');
});
