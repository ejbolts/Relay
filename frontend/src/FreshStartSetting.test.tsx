// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { FreshStartSetting } from './FreshStartSetting';
import { TrainingBlocksProvider } from './TrainingBlocksProvider';
import { recordBadgeLabel, recordScopeLabel } from './recordScope';
import { blockDay, freshStartOn } from './trainingBlocks';
import type { TrainingBlocks } from './types';
import { localDate } from './utils';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    api: {
      ...original.api,
      trainingBlocks: {
        ...original.api.trainingBlocks,
        get: vi.fn(),
        addFreshStart: vi.fn(),
        removeFreshStart: vi.fn(),
      },
    },
  };
});

let root: Root;
let container: HTMLDivElement;
let saved: TrainingBlocks;

const rows = () =>
  [...container.querySelectorAll('.fresh-start-list li')].map((row) => row.textContent);
const dateInput = () => container.querySelector<HTMLInputElement>('.fresh-start-add input')!;
const add = () => container.querySelector<HTMLFormElement>('.fresh-start-add')!;
const alertText = () => container.querySelector('[role="alert"]')?.textContent ?? null;

async function typeDate(value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setValue.call(dateInput(), value);
    dateInput().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  saved = { blocks: [], fresh_starts: [] };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(api.trainingBlocks.get).mockImplementation(async () => saved);
  vi.mocked(api.trainingBlocks.addFreshStart).mockImplementation(async (value) => {
    saved = { ...saved, fresh_starts: [...(saved.fresh_starts ?? []), value].sort() };
    return saved;
  });
  vi.mocked(api.trainingBlocks.removeFreshStart).mockImplementation(async (value) => {
    saved = { ...saved, fresh_starts: saved.fresh_starts!.filter((item) => item !== value) };
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

it('adds fresh starts newest first and removes them', async () => {
  await render();
  expect(rows()).toEqual([]);
  expect(dateInput().value).toBe(localDate());
  expect(dateInput().max).toBe(localDate());

  await act(async () => add().requestSubmit());
  expect(api.trainingBlocks.addFreshStart).toHaveBeenLastCalledWith(localDate());
  await typeDate('2026-01-05');
  await act(async () => add().requestSubmit());
  expect(api.trainingBlocks.addFreshStart).toHaveBeenLastCalledWith('2026-01-05');
  expect(rows()).toEqual([`${blockDay(localDate(), true)}Current`, '5 Jan 2026']);

  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Remove fresh start on 5 Jan 2026"]')!
      .click(),
  );
  expect(api.trainingBlocks.removeFreshStart).toHaveBeenLastCalledWith('2026-01-05');
  expect(rows()).toEqual([`${blockDay(localDate(), true)}Current`]);
});

it('refuses a repeated date and shows failed saves beside the setting', async () => {
  saved = { blocks: [], fresh_starts: ['2026-01-05'] };
  await render();
  await typeDate('2026-01-05');
  await act(async () => add().requestSubmit());
  expect(api.trainingBlocks.addFreshStart).not.toHaveBeenCalled();
  expect(alertText()).toBe('A fresh start already begins on that date.');

  vi.mocked(api.trainingBlocks.addFreshStart).mockRejectedValueOnce(new Error('Offline.'));
  await typeDate('2026-02-01');
  expect(alertText()).toBeNull();
  await act(async () => add().requestSubmit());
  expect(alertText()).toBe('Could not add the fresh start. Offline.');
  expect(rows()).toEqual(['5 Jan 2026Current']);
});

it('finds the fresh start a day belongs to', () => {
  const starts = ['2026-03-01', '2026-06-01'];
  expect(freshStartOn(starts, '2026-02-28')).toBeNull();
  expect(freshStartOn(starts, '2026-03-01')).toEqual({ start: '2026-03-01', end: '2026-06-01' });
  expect(freshStartOn(starts, '2026-07-01')).toEqual({ start: '2026-06-01', end: null });
  expect(freshStartOn([], '2026-07-01')).toBeNull();
});

it('names records by scope, treating unscoped records as all-time', () => {
  expect(recordScopeLabel({})).toBe('All-time');
  expect(recordScopeLabel({ scope: 'fresh_start' })).toBe('Fresh start');
  expect(recordScopeLabel({ scope: 'block' })).toBe('Block');
  expect(recordBadgeLabel([{ scope: 'block' }, { scope: 'fresh_start' }])).toBe('Fresh start PR');
  expect(recordBadgeLabel([{ scope: 'block' }, { scope: 'all_time' }])).toBe('All-time PR');
  expect(recordBadgeLabel([{ scope: 'block' }])).toBe('Block PR');
});
