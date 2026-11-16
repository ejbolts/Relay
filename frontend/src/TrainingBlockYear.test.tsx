// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { blockCode, blockKind, suggestedBlockName } from './blockKinds';
import { TrainingBlockDialog } from './TrainingBlockDialog';
import { TrainingBlocksProvider } from './TrainingBlocksProvider';
import type { BlockStats, TrainingBlock, TrainingBlocks } from './types';

const block = (
  id: string,
  kind: TrainingBlock['kind'],
  start: string,
  end: string | null,
  extra: Partial<TrainingBlock> = {},
): TrainingBlock => ({
  id,
  name: id,
  kind,
  start_date: start,
  end_date: end,
  workout_count: 10,
  ...extra,
});
const config: TrainingBlocks = {
  blocks: [
    block('Strength 1', 'strength', '2025-03-17', '2025-07-14'),
    block('Recovery · Lower back', 'recovery', '2025-07-14', '2026-03-02', {
      focus: 'Lower back',
    }),
    block('Strength 1 ', 'strength', '2026-03-02', '2026-05-04'),
    block('Recovery · Left shoulder', 'recovery', '2026-05-04', '2026-06-15', {
      focus: 'Left shoulder',
    }),
    block('Hypertrophy 1', 'hypertrophy', '2026-06-15', '2026-08-10'),
    block('Strength 2', 'strength', '2026-08-10', '2026-11-02'),
    block('Strength 3', 'strength', '2026-11-02', null, { planned_end_date: '2026-12-13' }),
  ],
};
const stats = (id: string, volume: number, prs: number): BlockStats => ({
  block_id: id,
  name: id,
  start_date: '2026-01-01',
  workout_count: 8,
  set_count: 100,
  volume_kg: volume,
  pr_count: prs,
});

let host: HTMLDivElement, root: Root;
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('button')];
const button = (label: string) =>
  buttons().find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  )!;
const click = async (target: string | HTMLElement) =>
  act(async () => (typeof target === 'string' ? button(target) : target).click());
const chip = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Block type"] button')].find(
    (item) => item.textContent?.startsWith(label),
  )!;
const cardNames = () =>
  [...document.querySelectorAll('.training-block-cards li strong')].map((item) =>
    item.firstChild?.textContent?.trim(),
  );
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function open(start: 'blocks' | 'new' = 'blocks') {
  await act(async () =>
    root.render(
      <TrainingBlocksProvider>
        <TrainingBlockDialog start={start} onClose={() => {}} onNotice={() => {}} />
      </TrainingBlocksProvider>,
    ),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 16, 12));
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
  vi.spyOn(api.trainingBlocks, 'summary').mockImplementation(async (id) => ({
    block: id === 'Strength 3' ? stats(id, 6000, 4) : stats(id, 12000, 6),
    previous: null,
  }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('names, numbers and codes blocks by type within each year', () => {
  expect(blockKind({ kind: 'power' })).toBeNull();
  expect(blockKind({ kind: null, deload: true })).toBe('deload');
  expect(blockCode(config.blocks, config.blocks[5])).toBe('S2');
  expect(blockCode(config.blocks, config.blocks[3])).toBe('R');
  expect(blockCode(config.blocks, block('Peak', null, '2026-01-01', null))).toBe('P');
  expect(suggestedBlockName(config.blocks, 'strength', '2026-11-16')).toBe('Strength 4');
  expect(suggestedBlockName(config.blocks, 'strength', '2027-01-04')).toBe('Strength 1');
  expect(suggestedBlockName(config.blocks, 'hypertrophy', '2026-11-16')).toBe('Hypertrophy 2');
  expect(suggestedBlockName(config.blocks, 'recovery', '2026-11-16', ' Left knee ')).toBe(
    'Recovery · Left knee',
  );
  expect(suggestedBlockName(config.blocks, 'deload', '2026-11-16')).toBe('Deload');
});

it('shows one year at a time and filters its blocks by type', async () => {
  await open();
  expect(document.querySelector('.training-block-years')?.textContent).toContain('20265 blocks');
  expect(document.querySelector('.training-block-year-bar')?.getAttribute('aria-label')).toBe(
    '2026: Recovery · Lower back, Strength 1 , Recovery · Left shoulder, Hypertrophy 1, Strength 2, Strength 3',
  );
  expect(
    [...document.querySelectorAll('.training-block-year-segment:not(.planned)')].map(
      (item) => item.textContent,
    ),
  ).toEqual(['R', 'S1', 'R', 'H1', 'S2', 'S3']);
  expect(document.querySelectorAll('.training-block-year-month')).toHaveLength(11);
  expect(document.querySelector('.training-block-year-segment.planned')).not.toBeNull();
  expect(chip('Strength').textContent).toBe('Strength3');
  expect(chip('Recovery').textContent).toBe('Recovery1');
  // The 2025 recovery block still shows where it runs into 2026, but belongs to 2025's list.
  expect(cardNames()).not.toContain('Recovery · Lower back');

  await click(chip('Strength'));
  expect(cardNames()).toEqual(['Strength 3', 'Strength 2', 'Strength 1']);
  expect(document.querySelectorAll('.training-block-year-segment.faded').length).toBeGreaterThan(0);
  await click(chip('Strength'));
  expect(cardNames()).toHaveLength(5);

  await click('Previous year');
  expect(document.querySelector('.training-block-years')?.textContent).toContain('20252 blocks');
  expect(cardNames()).toEqual(['Recovery · Lower back', 'Strength 1']);
  expect(document.querySelector('.training-block-now')).toBeNull();
  expect(button('Previous year').disabled).toBe(true);
});

it('compares the current block with the last block of its type', async () => {
  await open();
  const now = document.querySelector('.training-block-now')!;
  expect(now.querySelector('header')?.textContent).toBe('Strength 3Week 3 of 6 · 27 days left');
  expect(
    [...now.querySelectorAll('.training-block-weeks span')].map((item) => item.className),
  ).toEqual(['done', 'done', 'now', '', '', '']);
  // 6,000 kg over 15 days against 12,000 kg over Strength 2's 12 weeks.
  expect(now.querySelector('.training-block-vs')?.textContent).toBe(
    'vs Strength 2: +180% volume per week · 4 PRs vs 6',
  );
  expect(api.trainingBlocks.summary).toHaveBeenCalledWith('Strength 2');
});

it('starts a typed block with a suggested name and an injury for recovery', async () => {
  const create = vi.spyOn(api.trainingBlocks, 'create').mockResolvedValue(structuredClone(config));
  await open('new');
  const name = () =>
    [...document.querySelectorAll<HTMLInputElement>('input')].find((item) =>
      item.closest('label')?.textContent?.startsWith('Block name'),
    )!;
  expect(document.querySelector('[aria-label="Type"] [aria-checked="true"]')?.textContent).toBe(
    'Strength',
  );
  expect(name().value).toBe('Strength 4');
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Type"] button')].find(
      (item) => item.textContent === 'Recovery',
    )!,
  );
  const injury = [...document.querySelectorAll<HTMLInputElement>('input')].find((item) =>
    item.closest('label')?.textContent?.startsWith('Injury or focus'),
  )!;
  await type(injury, 'Left knee');
  expect(name().value).toBe('Recovery · Left knee');
  await type(name(), 'Knee rehab');
  await type(injury, 'Right knee');
  expect(name().value).toBe('Knee rehab');
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(create).toHaveBeenCalledWith({
    name: 'Knee rehab',
    start_date: '2026-11-16',
    planned_end_date: null,
    kind: 'recovery',
    focus: 'Right knee',
  });
});

it('keeps a block type and its name when editing', async () => {
  const update = vi.spyOn(api.trainingBlocks, 'update').mockResolvedValue(structuredClone(config));
  await open();
  await click('Edit Recovery · Left shoulder');
  expect(document.querySelector('[aria-label="Type"] [aria-checked="true"]')?.textContent).toBe(
    'Recovery',
  );
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Type"] button')].find(
      (item) => item.textContent === 'Strength',
    )!,
  );
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(update).toHaveBeenCalledWith('Recovery · Left shoulder', {
    name: 'Recovery · Left shoulder',
    start_date: '2026-05-04',
    planned_end_date: null,
    kind: 'strength',
    focus: null,
  });
});
