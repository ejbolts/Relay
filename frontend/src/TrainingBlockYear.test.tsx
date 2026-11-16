// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { blockColor } from './blockColors';
import { TrainingBlockDialog } from './TrainingBlockDialog';
import { TrainingBlocksProvider } from './TrainingBlocksProvider';
import type { BlockStats, TrainingBlock, TrainingBlocks } from './types';

const block = (
  id: string,
  start: string,
  end: string | null,
  extra: Partial<TrainingBlock> = {},
): TrainingBlock => ({
  id,
  name: id,
  start_date: start,
  end_date: end,
  workout_count: 10,
  ...extra,
});
const config: TrainingBlocks = {
  blocks: [
    block('Base', '2025-03-17', '2025-07-14'),
    block('Shoulder rehab', '2025-07-14', '2026-03-02', { color: '#6fd0b8' }),
    block('Spring strength', '2026-03-02', '2026-08-10', { color: '#f0a07f' }),
    block('Summer strength', '2026-08-10', '2026-10-26'),
    block('Deload week', '2026-10-26', '2026-11-02', { deload: true }),
    block('Peak', '2026-11-02', null, { planned_end_date: '2026-12-13' }),
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
const onClose = vi.fn();
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  )!;
const click = async (target: string | HTMLElement) =>
  act(async () => (typeof target === 'string' ? button(target) : target).click());
const cardNames = () =>
  [...document.querySelectorAll('.training-block-cards li strong')].map((item) =>
    item.firstChild?.textContent?.trim(),
  );
const segments = () => [
  ...document.querySelectorAll<HTMLButtonElement>(
    '.training-block-scroll:not(.detail) .training-block-year-bar button[aria-pressed]',
  ),
];
const scroller = () => document.querySelector<HTMLElement>('.training-block-scroll')!;
const trackWidth = () =>
  parseFloat(document.querySelector<HTMLElement>('.training-block-scroll-track')!.style.width);
const fire = (target: HTMLElement, type: string, init: Record<string, unknown>) =>
  act(async () => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, init);
    target.dispatchEvent(event);
  });
const segmentNames = () => segments().map((item) => item.getAttribute('aria-label')?.split(',')[0]);
const segment = (name: string) =>
  segments().find((item) => item.getAttribute('aria-label')?.startsWith(`${name},`))!;
const title = () => document.querySelector('dialog[open] h2')?.textContent;
const field = (label: string) =>
  [...document.querySelectorAll<HTMLInputElement>('input')].find((item) =>
    item.closest('label')?.textContent?.startsWith(label),
  )!;
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const submit = () =>
  act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
async function open(start: 'blocks' | 'new' = 'blocks') {
  await act(async () =>
    root.render(
      <TrainingBlocksProvider>
        <TrainingBlockDialog start={start} onClose={onClose} onNotice={() => {}} />
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
  onClose.mockReset();
  vi.spyOn(api.trainingBlocks, 'get').mockResolvedValue(structuredClone(config));
  vi.spyOn(api.trainingBlocks, 'summary').mockImplementation(async (id) => ({
    block: id === 'Peak' ? stats(id, 6000, 4) : stats(id, 12000, 6),
    previous: null,
  }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('colours a block with its own choice, the accent while current, or a tone', () => {
  const today = '2026-11-16';
  expect(blockColor(config.blocks, config.blocks[2], today)).toBe('#f0a07f');
  expect(blockColor(config.blocks, config.blocks[5], today)).toBe('var(--p-accent-text)');
  expect(blockColor(config.blocks, config.blocks[0], today)).toBe('#8aa4bd');
  expect(blockColor(config.blocks, { ...config.blocks[3], color: 'red' }, today)).toBe('#6fb59a');
});

it('shows every block on one timeline and lists the year in view', async () => {
  await open();
  expect(document.querySelector('.training-block-years')?.textContent).toContain('20264 blocks');
  expect(segmentNames()).toEqual([
    'Base',
    'Shoulder rehab',
    'Spring strength',
    'Summer strength',
    'Deload week',
    'Peak',
  ]);
  expect(segment('Spring strength').style.getPropertyValue('--block-color')).toBe('#f0a07f');
  // Two years: a dashed line where 2026 starts and a dotted line for every other month.
  expect(document.querySelectorAll('.training-block-scroll-line.year')).toHaveLength(1);
  expect(document.querySelectorAll('.training-block-scroll-line.month')).toHaveLength(22);
  expect(document.querySelectorAll('.training-block-scroll-line.week')).toHaveLength(0);
  expect(document.querySelector('.training-block-year-segment.planned')).not.toBeNull();
  expect(document.querySelector('[aria-label="Block type"]')).toBeNull();
  // A block belongs to the year it starts in, though the bar shows it running into this one.
  expect(cardNames()).toEqual(['Peak', 'Deload week', 'Summer strength', 'Spring strength']);

  await click('Previous year');
  expect(document.querySelector('.training-block-years')?.textContent).toContain('20252 blocks');
  expect(cardNames()).toEqual(['Shoulder rehab', 'Base']);
  expect(document.querySelector('.training-block-now')).toBeNull();
  expect(button('Previous year').disabled).toBe(true);
});

it('compares the current block with the last regular block, skipping deloads', async () => {
  await open();
  const now = document.querySelector('.training-block-now')!;
  expect(now.querySelector('header')?.textContent).toBe('PeakWeek 3 of 6 · 27 days left');
  expect(
    [...now.querySelectorAll('.training-block-weeks span')].map((item) => item.className),
  ).toEqual(['done', 'done', 'now', '', '', '']);
  // 6,000 kg over 15 days against 12,000 kg over Summer strength's 11 weeks.
  expect(now.querySelector('.training-block-vs')?.textContent).toBe(
    'vs Summer strength: +157% volume per week · 4 PRs vs 6',
  );
  expect(api.trainingBlocks.summary).toHaveBeenCalledWith('Summer strength');
});

it('highlights a block and its card when its part of the timeline is tapped', async () => {
  await open();
  await click(segment('Summer strength'));
  expect(segment('Summer strength').getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector('.training-block-cards li.selected strong')?.textContent).toBe(
    'Summer strength',
  );
  // The 2025 rehab block runs into 2026, and tapping it moves to its own year.
  await click(segment('Shoulder rehab'));
  expect(document.querySelector('.training-block-years strong')?.textContent).toBe('2025');
  expect(document.querySelector('.training-block-cards li.selected strong')?.textContent).toBe(
    'Shoulder rehab',
  );
  await click(segment('Shoulder rehab'));
  expect(document.querySelector('.training-block-cards li.selected')).toBeNull();
});

it('zooms the timeline with a pinch, Ctrl + wheel or the keyboard', async () => {
  await open();
  const start = trackWidth();
  // Showing a year across a 320px view: weeks are too narrow for their own lines.
  expect(start).toBeCloseTo((320 / 365) * 730, 0);
  const wheel = new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, cancelable: true });
  await act(async () => scroller().dispatchEvent(wheel));
  expect(wheel.defaultPrevented).toBe(true);
  expect(trackWidth()).toBeCloseTo(start * Math.E, 0);
  expect(document.querySelectorAll('.training-block-scroll-line.week').length).toBeGreaterThan(90);

  await act(async () => {
    scroller().dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }));
  });
  expect(trackWidth()).toBeCloseTo((start * Math.E) / 1.5, 0);

  const touch = (x: number) => ({ clientX: x, clientY: 0 });
  await fire(scroller(), 'touchstart', { touches: [touch(100), touch(200)] });
  await fire(scroller(), 'touchmove', { touches: [touch(50), touch(250)] });
  expect(trackWidth()).toBeCloseTo(((start * Math.E) / 1.5) * 2, 0);
  await fire(scroller(), 'touchend', { touches: [] });
  // Zooming out stops once the whole history fits.
  for (let step = 0; step < 6; step += 1) {
    await act(async () => {
      scroller().dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }));
    });
  }
  expect(trackWidth()).toBeCloseTo(320, 0);
});

it('shows the timeline full screen in landscape with the tapped block', async () => {
  await open();
  const toggle = button('View Training timeline full screen in landscape');
  expect(toggle.textContent).toBe('');
  await click(toggle);
  const viewer = document.querySelector<HTMLDialogElement>('dialog.landscape-chart-modal')!;
  expect(viewer.open).toBe(true);
  expect(viewer.querySelector('.training-block-scroll.detail')).not.toBeNull();
  await click(
    [...viewer.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((item) =>
      item.getAttribute('aria-label')?.startsWith('Base,'),
    )!,
  );
  expect(viewer.querySelector('.training-block-full-detail')?.textContent).toBe(
    'Base17 Mar – 13 Jul 2025 · 10 workouts',
  );
  await click('Exit full-screen Training timeline');
  expect(document.querySelector('dialog.landscape-chart-modal')).toBeNull();
  expect(document.querySelector('.training-block-years strong')?.textContent).toBe('2025');
  expect(document.querySelector('.training-block-cards li.selected strong')?.textContent).toBe(
    'Base',
  );
});

it('starts a named block with an optional colour', async () => {
  const create = vi.spyOn(api.trainingBlocks, 'create').mockResolvedValue(structuredClone(config));
  await open('new');
  expect(document.querySelector('[aria-label="Type"]')).toBeNull();
  expect(field('Block name').value).toBe('');
  expect(
    [...document.querySelectorAll('[aria-label="Starts"] [role="radio"]')].map(
      (item) => item.firstChild?.textContent,
    ),
  ).toEqual(['Today', '1 January', 'Custom']);
  expect(
    [...document.querySelectorAll('[aria-label="Ends"] [role="radio"]')].map(
      (item) => item.firstChild?.textContent,
    ),
  ).toContain('Custom');
  expect(button('Automatic colour').getAttribute('aria-checked')).toBe('true');
  await type(field('Block name'), 'Winter strength');
  await click('#f0a07f');
  expect(button('#f0a07f').getAttribute('aria-checked')).toBe('true');
  await submit();
  expect(create).toHaveBeenCalledWith({
    name: 'Winter strength',
    start_date: '2026-11-16',
    planned_end_date: null,
    color: '#f0a07f',
  });
});

it('returns to the blocks from an edit or removal instead of closing', async () => {
  const update = vi.spyOn(api.trainingBlocks, 'update').mockResolvedValue(structuredClone(config));
  await open();
  await click('Edit Spring strength');
  expect(title()).toBe('Edit block');
  expect(button('#f0a07f').getAttribute('aria-checked')).toBe('true');
  await click('Close Edit block');
  expect(onClose).not.toHaveBeenCalled();
  expect(title()).toBe('Training blocks');

  await click('Edit Spring strength');
  await click('Remove');
  expect(title()).toBe('Remove training block?');
  await click('Close Remove training block?');
  expect(title()).toBe('Edit block');
  await click('Automatic colour');
  await submit();
  expect(update).toHaveBeenCalledWith('Spring strength', {
    name: 'Spring strength',
    start_date: '2026-03-02',
    planned_end_date: null,
    color: null,
  });
  expect(title()).toBe('Training blocks');

  await click('Close Training blocks');
  expect(onClose).toHaveBeenCalledOnce();
});
