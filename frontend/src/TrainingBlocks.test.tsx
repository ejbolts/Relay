// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { ProgressScreen } from './App';
import { blockRange } from './trainingBlocks';
import { TrainingBlocksProvider } from './TrainingBlocksProvider';
import type { Exercise, TrainingBlocks, PersonalRecord } from './types';

const bench: Exercise = {
  id: 'bench',
  name: 'Bench Press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const config: TrainingBlocks = {
  auto_yearly: false,
  blocks: [{ id: 'rebuild', name: 'Rebuild', start_date: '2026-06-01', end_date: null }],
};
let host: HTMLDivElement, root: Root;
const button = (label: string) =>
  [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  )!;
const click = async (label: string) => act(async () => button(label).click());
async function input(label: string, value: string) {
  const element = [...document.querySelectorAll('input')].find(
    (item) => item.closest('label')?.textContent?.trim() === label,
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function mount(records: PersonalRecord[] = []) {
  await act(async () =>
    root.render(
      <TrainingBlocksProvider>
        <ProgressScreen
          exerciseLibrary={{ summaries: [], loading: false, error: false, retry: () => {} }}
          exercises={[bench]}
          measurements={[]}
          personalRecords={records}
          onOpenWorkout={() => {}}
        />
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
  vi.spyOn(api, 'getWeightMapping').mockResolvedValue({
    enabled: false,
    reference_machine_id: null,
    machines: [],
  });
  vi.spyOn(api, 'exerciseProgress').mockImplementation(async (_id, blockId) => ({
    exercise: bench,
    personal_best_weight_kg: blockId ? 90 : 120,
    personal_best_estimated_1rm: blockId ? 90 : 120,
    points: [
      {
        workout_id: 'one',
        workout_date: '2026-06-02',
        best_weight_kg: blockId ? 90 : 120,
        best_reps: 8,
        estimated_1rm: blockId ? 90 : 120,
        volume_kg: 720,
        best_rpe: null,
      },
    ],
  }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
const submitForm = () =>
  act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
const radio = (label: string) =>
  [...document.querySelectorAll('[role="radio"]')].find(
    (item) => item.textContent?.trim() === label,
  ) as HTMLButtonElement;

it('reuses the exercise chart for the current block and all-time view', async () => {
  await mount();
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('bench', 'rebuild');
  expect(host.querySelector('.progress-hero-value')?.textContent).toContain('90');
  expect(radio('This block').getAttribute('aria-checked')).toBe('true');
  await act(async () => radio('All time').click());
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('bench', undefined);
  expect(host.querySelector('.progress-hero-value')?.textContent).toContain('120');
  expect(button('Training block: Rebuild')).toBeUndefined();
  await act(async () => radio('This block').click());
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('bench', 'rebuild');
});

it('shows block ranges and workout counts in the picker and blocks page', async () => {
  vi.mocked(api.trainingBlocks.get).mockResolvedValue({
    auto_yearly: false,
    earlier_workout_count: 40,
    history_start: '2024-03-01',
    blocks: [
      {
        id: 'base',
        name: 'Base',
        start_date: '2026-01-01',
        end_date: '2026-06-01',
        workout_count: 30,
      },
      { ...config.blocks[0], workout_count: 12 },
    ],
  });
  await mount();
  expect(button('Training block: Rebuild').textContent).toContain('12 workouts');
  await click('Training block: Rebuild');
  expect(
    document.querySelector('[role="radiogroup"][aria-label="Training block"]')?.textContent,
  ).toContain('1 Jan – 31 May 2026 · 30 workouts');
  await act(async () => radio('Base1 Jan – 31 May 2026 · 30 workouts').click());
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('bench', 'base');
  await act(async () => radio('All time').click());
  await act(async () => radio('This block').click());
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('bench', 'base');
  await click('Training block: Base');
  await click('Edit blocks');
  expect(document.querySelector('.training-block-bar')?.getAttribute('aria-label')).toBe(
    'Timeline: Before blocks, Base, Rebuild',
  );
  expect(document.querySelector('.training-block-cards')?.textContent).toContain(
    'Before blocks1 Mar 2024 – 31 Dec 202540 workouts',
  );
});

it('formats ranges with the exclusive end date and the current year', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 8, 12));
  try {
    expect(blockRange('2026-08-10', null)).toBe('10 Aug – Today');
    expect(blockRange('2025-08-10', null)).toBe('10 Aug 2025 – Today');
    expect(blockRange('2026-04-12', '2026-08-10')).toBe('12 Apr – 9 Aug 2026');
    expect(blockRange('2025-01-01', '2026-04-12')).toBe('1 Jan 2025 – 11 Apr 2026');
    expect(blockRange('2026-04-12', '2026-04-13')).toBe('12 Apr 2026');
  } finally {
    vi.useRealTimers();
  }
});

it('creates a named custom block and shows an automatically dismissing toast', async () => {
  const next = {
    ...config,
    blocks: [
      ...config.blocks,
      { id: 'winter', name: 'Winter strength', start_date: '2026-07-01', end_date: null },
    ],
  };
  vi.spyOn(api.trainingBlocks, 'create').mockResolvedValue(next);
  await mount();
  await click('Training block: Rebuild');
  await click('New block');
  await input('Block name', 'Winter strength');
  expect(document.querySelector('input[type="date"]')).toBeNull();
  await act(async () => radio('Pick date').click());
  await input('Start date', '2026-07-01');
  await submitForm();
  expect(api.trainingBlocks.create).toHaveBeenCalledWith({
    name: 'Winter strength',
    start_date: '2026-07-01',
  });
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    'Training block started',
  );
  expect(document.querySelector('dialog[open]')).toBeNull();
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('bench', 'winter');
});

it('starts the first block from the all-time view', async () => {
  vi.mocked(api.trainingBlocks.get).mockResolvedValue({ blocks: [], auto_yearly: false });
  vi.spyOn(api.trainingBlocks, 'create').mockResolvedValue(structuredClone(config));
  await mount();
  expect(radio('This block')).toBeUndefined();
  await click('Start a block');
  await input('Block name', 'Rebuild');
  await act(async () => radio('1 January2026').click());
  await submitForm();
  expect(api.trainingBlocks.create).toHaveBeenCalledWith({
    name: 'Rebuild',
    start_date: `${new Date().getFullYear()}-01-01`,
  });
});

it('keeps failed saves editable and supports renaming and removing only the boundary', async () => {
  vi.spyOn(api.trainingBlocks, 'update')
    .mockRejectedValueOnce(new Error('A block already starts on that date.'))
    .mockResolvedValueOnce(config);
  vi.spyOn(api.trainingBlocks, 'remove').mockResolvedValue({ blocks: [], auto_yearly: false });
  await mount();
  await click('Training block: Rebuild');
  await click('Edit blocks');
  await click('Edit Rebuild');
  expect(radio('Pick date1 Jun 2026').getAttribute('aria-checked')).toBe('true');
  await submitForm();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('already starts');
  expect(button('Save block').disabled).toBe(false);
  await submitForm();
  expect(api.trainingBlocks.update).toHaveBeenCalledWith('rebuild', {
    name: 'Rebuild',
    start_date: '2026-06-01',
  });
  expect(document.querySelector('.training-block-cards')).not.toBeNull();
  await click('Edit Rebuild');
  await click('Remove');
  expect(document.body.textContent).toContain('Workouts stay saved');
  await click('Remove block');
  expect(api.trainingBlocks.remove).toHaveBeenCalledWith('rebuild');
  expect(document.querySelector('dialog[open]')).toBeNull();
  expect(button('Start a block')).toBeDefined();
});

it('saves the optional yearly rollover without resetting the viewed chart', async () => {
  vi.spyOn(api.trainingBlocks, 'preferences').mockResolvedValue({ ...config, auto_yearly: true });
  await mount();
  await click('Training block: Rebuild');
  await click('Edit blocks');
  await click('Start a new block each January');
  expect(api.trainingBlocks.preferences).toHaveBeenCalledWith(true);
  expect(button('Start a new block each January').getAttribute('aria-checked')).toBe('true');
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('bench', 'rebuild');
});

it('explains block and all-time records in a dismissable popover', async () => {
  await mount();
  await click('How training blocks work');
  const help = document.querySelector('[role="region"][aria-label="How training blocks work"]');
  expect(help?.textContent).toContain('Block PR');
  expect(help?.textContent).toContain('All-time PR');
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(
    document.querySelector('[role="region"][aria-label="How training blocks work"]'),
  ).toBeNull();
});

it('keeps record scope specific to the viewed exercise in mixed workouts', async () => {
  const record: PersonalRecord = {
    id: 'block-pr',
    scope: 'block',
    block_id: 'rebuild',
    exercise_id: 'bench',
    workout_id: 'one',
    set_id: 'set',
    achieved_date: '2026-06-02',
    record_type: 'weight',
    value: 95,
    unit: 'kg',
    normalized_weight: 95,
    weight_kg: 95,
    formula: null,
    exercise_name: 'Bench Press',
  };
  await mount([record, { ...record, id: 'other-lift', scope: 'all_time', exercise_id: 'squat' }]);
  expect(host.querySelector('.pr-chip')?.textContent).toBe('Block PR');
});

it('refreshes synced boundaries without changing an explicitly selected all-time view', async () => {
  await mount();
  await act(async () => radio('All time').click());
  vi.mocked(api.trainingBlocks.get).mockResolvedValue({
    ...config,
    blocks: [{ ...config.blocks[0], name: 'Renamed block', start_date: '2026-05-01' }],
  });
  await act(async () => window.dispatchEvent(new Event('training-data-refreshed')));
  expect(radio('All time').getAttribute('aria-checked')).toBe('true');
  await act(async () => radio('This block').click());
  expect(button('Training block: Renamed block')).toBeDefined();
});
