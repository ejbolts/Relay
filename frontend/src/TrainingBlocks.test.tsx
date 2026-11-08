// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { ProgressScreen } from './App';
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

it('reuses the exercise chart for the current block and all-time view', async () => {
  await mount();
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('bench', 'rebuild');
  expect(host.querySelector('.progress-hero-value')?.textContent).toContain('90');
  const select = document.querySelector<HTMLSelectElement>('[aria-label="Training block"]')!;
  await act(async () => {
    select.value = 'all';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('bench', undefined);
  expect(host.querySelector('.progress-hero-value')?.textContent).toContain('120');
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
  await click('Manage blocks');
  await input('Block name', 'Winter strength');
  await input('Start date', '2026-07-01');
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(api.trainingBlocks.create).toHaveBeenCalledWith({
    name: 'Winter strength',
    start_date: '2026-07-01',
  });
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    'Training block started',
  );
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('bench', 'winter');
});

it('keeps failed saves editable and supports renaming and removing only the boundary', async () => {
  vi.spyOn(api.trainingBlocks, 'update')
    .mockRejectedValueOnce(new Error('A block already starts on that date.'))
    .mockResolvedValueOnce(config);
  vi.spyOn(api.trainingBlocks, 'remove').mockResolvedValue({ blocks: [], auto_yearly: false });
  await mount();
  await click('Manage blocks');
  await click('Edit Rebuild');
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('already starts');
  expect(button('Save block').disabled).toBe(false);
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(api.trainingBlocks.update).toHaveBeenCalledWith('rebuild', {
    name: 'Rebuild',
    start_date: '2026-06-01',
  });
  await click('Manage blocks');
  await click('Remove Rebuild');
  expect(document.body.textContent).toContain('Workouts stay saved');
  await click('Remove block');
  expect(api.trainingBlocks.remove).toHaveBeenCalledWith('rebuild');
  expect(document.querySelector<HTMLSelectElement>('[aria-label="Training block"]')?.value).toBe(
    'all',
  );
});

it('saves the optional yearly rollover without resetting the viewed chart', async () => {
  vi.spyOn(api.trainingBlocks, 'preferences').mockResolvedValue({ ...config, auto_yearly: true });
  await mount();
  await click('Manage blocks');
  await act(async () => document.querySelector<HTMLInputElement>('[type="checkbox"]')!.click());
  expect(api.trainingBlocks.preferences).toHaveBeenCalledWith(true);
  expect(document.querySelector<HTMLInputElement>('[type="checkbox"]')!.checked).toBe(true);
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
  const select = document.querySelector<HTMLSelectElement>('[aria-label="Training block"]')!;
  await act(async () => {
    select.value = 'all';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  vi.mocked(api.trainingBlocks.get).mockResolvedValue({
    ...config,
    blocks: [{ ...config.blocks[0], name: 'Renamed block', start_date: '2026-05-01' }],
  });
  await act(async () => window.dispatchEvent(new Event('training-data-refreshed')));
  expect(select.textContent).toContain('Renamed block');
  expect(select.value).toBe('all');
});
