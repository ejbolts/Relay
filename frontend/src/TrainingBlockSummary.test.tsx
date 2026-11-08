// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { blockChange, blockFinished, nextBlockName } from './trainingBlocks';
import { TrainingBlockHome } from './TrainingBlockSummary';
import { TrainingBlocksProvider } from './TrainingBlocksProvider';
import type { BlockStats, TrainingBlock, TrainingBlockSummary, TrainingBlocks } from './types';

const base: TrainingBlock = {
  id: 'base',
  name: 'Base',
  start_date: '2026-01-05',
  end_date: '2026-06-01',
  planned_end_date: '2026-05-31',
};
const rebuild: TrainingBlock = {
  id: 'rebuild',
  name: 'Strength rebuild',
  start_date: '2026-06-01',
  end_date: null,
  planned_end_date: '2026-10-25',
};
const config: TrainingBlocks = { blocks: [base, rebuild] };
const stats = (overrides: Partial<BlockStats>): BlockStats => ({
  block_id: 'rebuild',
  name: 'Strength rebuild',
  start_date: '2026-06-01',
  workout_count: 40,
  set_count: 600,
  volume_kg: 12_000,
  pr_count: 7,
  ...overrides,
});
const summary: TrainingBlockSummary = {
  block: stats({}),
  previous: stats({
    block_id: 'base',
    name: 'Base',
    workout_count: 40,
    set_count: 700,
    volume_kg: 10_000,
    pr_count: 4,
  }),
};
const TODAY = '2026-11-08';
let host: HTMLDivElement, root: Root;
const button = (label: string) =>
  [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  )!;
const click = (label: string) => act(async () => button(label).click());

async function mount(block: TrainingBlock = rebuild, onOpen = () => {}) {
  await act(async () =>
    root.render(
      <TrainingBlocksProvider>
        <TrainingBlockHome block={block} config={config} today={TODAY} onOpen={onOpen} />
      </TrainingBlocksProvider>,
    ),
  );
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(api.trainingBlocks, 'get').mockResolvedValue(structuredClone(config));
  vi.spyOn(api.trainingBlocks, 'summary').mockResolvedValue(summary);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

it('finishes a block the day after its planned end and names the next one', () => {
  expect(blockFinished(rebuild, '2026-10-25')).toBe(false);
  expect(blockFinished(rebuild, '2026-10-26')).toBe(true);
  expect(blockFinished({ ...rebuild, planned_end_date: null }, '2027-01-01')).toBe(false);
  expect(nextBlockName(config.blocks)).toBe('Block 3');
  expect(nextBlockName([...config.blocks, { ...base, id: 'd', deload: true }])).toBe('Block 3');
  expect(nextBlockName([])).toBe('Block 1');
});

it('describes the change from the previous block', () => {
  expect(blockChange(5, undefined)).toBeNull();
  expect(blockChange(12_000, 10_000, true)).toEqual({ direction: 'up', text: '20% more' });
  expect(blockChange(7_500, 10_000, true)).toEqual({ direction: 'down', text: '25% less' });
  expect(blockChange(7, 4)).toEqual({ direction: 'up', text: '3 more' });
  expect(blockChange(4, 4)).toEqual({ direction: 'same', text: 'Same as last block' });
  expect(blockChange(3, 0, true)).toEqual({ direction: 'up', text: 'New' });
});

it('keeps opening progress while a block is still running', async () => {
  const onOpen = vi.fn();
  await mount({ ...rebuild, planned_end_date: '2026-12-20' }, onOpen);
  expect(host.textContent).not.toContain('Finished');
  await act(async () => host.querySelector('button')!.click());
  expect(onOpen).toHaveBeenCalled();
  expect(api.trainingBlocks.summary).not.toHaveBeenCalled();
});

it('shows the summary of a finished block against the previous block', async () => {
  await mount();
  expect(host.textContent).toContain('Finished');
  expect(host.textContent).toContain('21 weeks · ended 25 Oct');
  await act(async () => host.querySelector('button')!.click());
  expect(api.trainingBlocks.summary).toHaveBeenCalledWith('rebuild');
  const dialog = document.querySelector('dialog')!;
  expect(dialog.querySelector('h2')?.textContent).toBe('Strength rebuild');
  expect(dialog.textContent).toContain('Block complete');
  const tiles = [...dialog.querySelectorAll('.training-block-tile')].map(
    (tile) => tile.textContent,
  );
  expect(tiles).toEqual([
    'Volume12.0 t20% more',
    'PRs73 more',
    'Workouts40Same as last block',
    'Sets600100 less',
  ]);
  expect(dialog.textContent).toContain('Compared with Base');
});

it('shows totals without a comparison for the first block', async () => {
  vi.mocked(api.trainingBlocks.summary).mockResolvedValue({ block: summary.block, previous: null });
  await mount();
  await act(async () => host.querySelector('button')!.click());
  const dialog = document.querySelector('dialog')!;
  expect(dialog.querySelectorAll('.training-block-tile')).toHaveLength(4);
  expect(dialog.querySelector('.training-block-tile small')).toBeNull();
  expect(dialog.textContent).not.toContain('Compared with');
});

it('can retry a summary that failed to load', async () => {
  vi.mocked(api.trainingBlocks.summary).mockRejectedValueOnce(new Error('offline'));
  await mount();
  await act(async () => host.querySelector('button')!.click());
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    'Could not load the summary.',
  );
  await click('Retry');
  expect(document.querySelectorAll('.training-block-tile')).toHaveLength(4);
});

it('starts the next block today and confirms with a toast', async () => {
  const created: TrainingBlocks = {
    blocks: [
      { ...base },
      { ...rebuild, end_date: TODAY },
      {
        id: 'next',
        name: 'Peak',
        start_date: TODAY,
        end_date: null,
        planned_end_date: '2027-01-02',
      },
    ],
  };
  vi.spyOn(api.trainingBlocks, 'create').mockResolvedValue(created);
  await mount();
  await act(async () => host.querySelector('button')!.click());
  await click('Start next block');
  const name = document.querySelector<HTMLInputElement>('.training-block-form input')!;
  expect(name.value).toBe('Block 3');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name, 'Peak');
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="radio"]')]
      .find((item) => item.textContent?.startsWith('8 weeks'))!
      .click(),
  );
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(api.trainingBlocks.create).toHaveBeenCalledWith({
    name: 'Peak',
    start_date: TODAY,
    planned_end_date: '2027-01-02',
  });
  expect(document.querySelector('dialog')).toBeNull();
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    'Training block started',
  );
});

it('offers a deload week before the next block', async () => {
  vi.spyOn(api.trainingBlocks, 'create').mockResolvedValue(config);
  await mount();
  await act(async () => host.querySelector('button')!.click());
  await click('Deload week first');
  expect(document.querySelector('dialog')!.textContent).toContain(
    'A 7-day deload block starts today and runs to 14 Nov.',
  );
  await click('Start deload');
  expect(api.trainingBlocks.create).toHaveBeenCalledWith({
    name: 'Deload week',
    start_date: TODAY,
    planned_end_date: '2026-11-14',
    deload: true,
  });
  expect(document.querySelector('[role="status"]')?.textContent).toContain('Deload week started');
});

it('keeps the dialog open with the reason when the next block cannot be started', async () => {
  vi.spyOn(api.trainingBlocks, 'create').mockRejectedValue(
    new Error('A training block already starts on that date.'),
  );
  await mount();
  await act(async () => host.querySelector('button')!.click());
  await click('Deload week first');
  await click('Start deload');
  expect(document.querySelector('dialog')).not.toBeNull();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    'A training block already starts on that date.',
  );
});

it('does not offer another deload after a deload block', async () => {
  const deload = {
    ...rebuild,
    id: 'deload',
    name: 'Deload week',
    start_date: '2026-10-19',
    planned_end_date: '2026-10-25',
    deload: true,
  };
  vi.mocked(api.trainingBlocks.summary).mockResolvedValue({
    block: stats({ block_id: 'deload', deload: true }),
    previous: null,
  });
  await mount(deload);
  await act(async () => host.querySelector('button')!.click());
  expect(document.querySelector('dialog')!.textContent).toContain('Deload complete');
  expect(button('Deload week first')).toBeUndefined();
  expect(button('Start next block')).toBeDefined();
});
