// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { ProgressScreen } from './App';
import { ExerciseLibraryList } from './ExerciseLibraryList';
import { blockProgress, blockRange, daysLeftLabel } from './trainingBlocks';
import { TrainingBlockCardSettingsForm, TrainingBlockHomeCard } from './TrainingBlockHomeCard';
import { addDays } from './trainingSummary';
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
  blocks: [{ id: 'rebuild', name: 'Rebuild', start_date: '2026-06-01', end_date: null }],
};
let host: HTMLDivElement, root: Root;
const emptyLibrary = { summaries: [], loading: false, error: false, retry: () => {} };
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
        <ExerciseLibraryList exercises={[bench]} library={emptyLibrary} onOpen={() => {}} />
        <ProgressScreen
          exerciseLibrary={emptyLibrary}
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
const openOptions = () => click('Exercise list options');
const scope = () => document.querySelector<HTMLSelectElement>('[aria-label="Training block"]');
async function chooseScope(value: string) {
  await act(async () => {
    scope()!.value = value;
    scope()!.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function manageBlocks() {
  await openOptions();
  await click('Training blocks');
}
const radio = (label: string) =>
  [...document.querySelectorAll('[role="radio"]')].find(
    (item) => item.textContent?.trim() === label,
  ) as HTMLButtonElement;

it('reuses the exercise chart for the current block and all-time view', async () => {
  await mount();
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('bench', 'rebuild');
  expect(host.querySelector('.progress-hero-value')?.textContent).toContain('90');
  expect(document.querySelector('.training-block-scope')).toBeNull();
  await openOptions();
  expect(scope()?.value).toBe('current');
  await chooseScope('all');
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('bench', undefined);
  expect(host.querySelector('.progress-hero-value')?.textContent).toContain('120');
  await chooseScope('current');
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('bench', 'rebuild');
});

it('chooses a block from list options and shows ranges and workout counts on the blocks page', async () => {
  vi.mocked(api.trainingBlocks.get).mockResolvedValue({
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
  await openOptions();
  expect([...scope()!.options].map((option) => option.textContent)).toEqual([
    'All time',
    'Rebuild (current)',
    'Base',
  ]);
  await chooseScope('base');
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('bench', 'base');
  await click('Training blocks');
  const year = new Date().getFullYear();
  if (year === 2026) {
    expect(document.querySelector('.training-block-year-bar')?.getAttribute('aria-label')).toBe(
      '2026: Base, Rebuild',
    );
    const cards = document.querySelector('.training-block-cards')?.textContent;
    expect(cards).toContain('1 Jan – 31 May 2026');
    expect(cards).toContain('12 workouts');
  }
  for (let shown = year; shown > 2025; shown -= 1) await click('Previous year');
  expect(document.querySelector('.training-block-cards')?.textContent).toBe(
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
  await manageBlocks();
  await click('New');
  await input('Block name', 'Winter strength');
  expect(document.querySelector('input[type="date"]')).toBeNull();
  await act(async () => radio('Pick date').click());
  await input('Start date', '2026-07-01');
  await submitForm();
  expect(api.trainingBlocks.create).toHaveBeenCalledWith({
    name: 'Winter strength',
    start_date: '2026-07-01',
    planned_end_date: null,
    kind: 'strength',
    focus: null,
  });
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    'Training block started',
  );
  expect(document.querySelector('dialog[open]')).toBeNull();
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('bench', 'winter');
});

it('starts the first block from the all-time view', async () => {
  vi.mocked(api.trainingBlocks.get).mockResolvedValue({ blocks: [] });
  vi.spyOn(api.trainingBlocks, 'create').mockResolvedValue(structuredClone(config));
  await mount();
  await openOptions();
  expect(scope()).toBeNull();
  await click('Start a block');
  await input('Block name', 'Rebuild');
  await act(async () => radio(`1 January${new Date().getFullYear()}`).click());
  await act(async () =>
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Ends"] [role="radio"]')]
      .find((item) => item.textContent?.startsWith('12 weeks'))!
      .click(),
  );
  await submitForm();
  expect(api.trainingBlocks.create).toHaveBeenCalledWith({
    name: 'Rebuild',
    start_date: `${new Date().getFullYear()}-01-01`,
    planned_end_date: addDays(`${new Date().getFullYear()}-01-01`, 83),
    kind: 'strength',
    focus: null,
  });
});

it('keeps failed saves editable and supports renaming and removing only the boundary', async () => {
  vi.spyOn(api.trainingBlocks, 'update')
    .mockRejectedValueOnce(new Error('A block already starts on that date.'))
    .mockResolvedValueOnce(config);
  vi.spyOn(api.trainingBlocks, 'remove').mockResolvedValue({ blocks: [] });
  await mount();
  await manageBlocks();
  await click('Edit Rebuild');
  expect(radio('Pick date1 Jun 2026').getAttribute('aria-checked')).toBe('true');
  await submitForm();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('already starts');
  expect(button('Save block').disabled).toBe(false);
  await submitForm();
  expect(api.trainingBlocks.update).toHaveBeenCalledWith('rebuild', {
    name: 'Rebuild',
    start_date: '2026-06-01',
    planned_end_date: null,
    kind: null,
    focus: null,
  });
  expect(document.querySelector('.training-block-cards')).not.toBeNull();
  await click('Edit Rebuild');
  await click('Remove');
  expect(document.body.textContent).toContain('Workouts stay saved');
  await click('Remove block');
  expect(api.trainingBlocks.remove).toHaveBeenCalledWith('rebuild');
  expect(document.querySelector('dialog[open]')).toBeNull();
  await openOptions();
  expect(button('Start a block')).toBeDefined();
});

it('only lists user-created blocks with no automatic rollover option', async () => {
  await mount();
  await manageBlocks();
  expect(document.querySelectorAll('.training-block-cards li')).toHaveLength(1);
  expect(document.querySelector('dialog[open] [role="switch"]')).toBeNull();
  expect(document.querySelector('dialog[open]')?.textContent).not.toContain('January');
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
  await openOptions();
  await chooseScope('all');
  vi.mocked(api.trainingBlocks.get).mockResolvedValue({
    ...config,
    blocks: [{ ...config.blocks[0], name: 'Renamed block', start_date: '2026-05-01' }],
  });
  await act(async () => window.dispatchEvent(new Event('training-data-refreshed')));
  expect(scope()?.value).toBe('all');
  expect(scope()?.textContent).toContain('Renamed block (current)');
});

it('keeps a custom planned end when editing and validates it after the start', async () => {
  vi.mocked(api.trainingBlocks.get).mockResolvedValue({
    ...config,
    blocks: [{ ...config.blocks[0], planned_end_date: '2026-09-30' }],
  });
  vi.spyOn(api.trainingBlocks, 'update').mockResolvedValue(config);
  await mount();
  await manageBlocks();
  await click('Edit Rebuild');
  const ends = [...document.querySelectorAll('[aria-label="Ends"] [role="radio"]')];
  expect(ends.find((item) => item.getAttribute('aria-checked') === 'true')?.textContent).toBe(
    'Pick date30 Sep',
  );
  expect(document.querySelector<HTMLInputElement>('input[min="2026-06-02"]')?.value).toBe(
    '2026-09-30',
  );
  await submitForm();
  expect(api.trainingBlocks.update).toHaveBeenCalledWith('rebuild', {
    name: 'Rebuild',
    start_date: '2026-06-01',
    planned_end_date: '2026-09-30',
    kind: null,
    focus: null,
  });
});

it('reports week number, planned length and days left', () => {
  const block = { ...config.blocks[0], start_date: '2026-08-10' };
  expect(blockProgress(block, '2026-08-10')).toEqual({
    week: 1,
    weeks: null,
    daysLeft: null,
    progress: null,
  });
  const planned = { ...block, planned_end_date: '2026-11-29' };
  expect(blockProgress(planned, '2026-11-08')).toMatchObject({ week: 13, weeks: 16, daysLeft: 21 });
  expect(daysLeftLabel(21)).toBe('21 days left');
  expect(daysLeftLabel(1)).toBe('1 day left');
  expect(daysLeftLabel(0)).toBe('Last day');
  expect(daysLeftLabel(-3)).toBe('3 days past plan');
});

it('shows the current block on the home card and opens it', async () => {
  const onOpen = vi.fn();
  const block = {
    ...config.blocks[0],
    name: 'Strength rebuild',
    start_date: '2026-08-10',
    planned_end_date: '2026-11-29',
  };
  await act(async () =>
    root.render(
      <TrainingBlockHomeCard
        block={block}
        config={{ blocks: [block] }}
        today="2026-11-08"
        style="progress"
        onOpen={onOpen}
      />,
    ),
  );
  expect(host.textContent).toBe('Training block21 days leftStrength rebuildWeek 13 of 16');
  expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('81');
  await act(async () => host.querySelector('button')!.click());
  expect(onOpen).toHaveBeenCalled();
  await act(async () =>
    root.render(
      <TrainingBlockHomeCard
        block={{ ...block, planned_end_date: null }}
        config={{ blocks: [block] }}
        today="2026-11-08"
        style="progress"
        onOpen={onOpen}
      />,
    ),
  );
  expect(host.textContent).toBe('Training blockStrength rebuildWeek 13 · since 10 Aug');
  expect(host.querySelector('[role="progressbar"]')).toBeNull();
  await act(async () =>
    root.render(
      <TrainingBlockHomeCard
        block={block}
        config={{ blocks: [block] }}
        today="2026-12-02"
        style="progress"
        onOpen={onOpen}
      />,
    ),
  );
  expect(host.textContent).toContain('3 days past plan');
  expect(host.textContent).toContain('Week 17 · planned 16');
});

it('adds the block timeline to the home card for the timeline and combined designs', async () => {
  const earlier = {
    ...config.blocks[0],
    id: 'base',
    name: 'Base',
    start_date: '2026-01-01',
    end_date: '2026-08-10',
  };
  const block = {
    ...config.blocks[0],
    name: 'Strength rebuild',
    start_date: '2026-08-10',
    planned_end_date: '2026-11-29',
  };
  const blocks = {
    blocks: [earlier, block],
    history_start: '2025-06-01',
    earlier_workout_count: 9,
  };
  const render = (style: 'progress' | 'timeline' | 'both') =>
    act(async () =>
      root.render(
        <TrainingBlockHomeCard
          block={block}
          config={blocks}
          today="2026-11-08"
          style={style}
          onOpen={() => {}}
        />,
      ),
    );
  await render('both');
  expect(host.querySelector('[role="progressbar"]')).not.toBeNull();
  expect(host.querySelector('.training-block-bar')?.getAttribute('aria-label')).toBe(
    'Timeline: Before blocks, Base, Strength rebuild',
  );
  expect(host.querySelector('.training-block-segment.current')?.textContent).toBe(
    'Strength rebuild',
  );
  await render('timeline');
  expect(host.querySelector('[role="progressbar"]')).toBeNull();
  expect(host.querySelector('.training-block-bar')).not.toBeNull();
  await render('progress');
  expect(host.querySelector('.training-block-bar')).toBeNull();
});

it('chooses the home card design', async () => {
  const onChange = vi.fn();
  await act(async () =>
    root.render(<TrainingBlockCardSettingsForm value={{ style: 'both' }} onChange={onChange} />),
  );
  const inputs = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  expect(inputs.map((item) => item.closest('label')?.textContent)).toEqual([
    'Progress',
    'Timeline',
    'Both',
  ]);
  expect(inputs[2].checked).toBe(true);
  await act(async () => inputs[1].click());
  expect(onChange).toHaveBeenCalledWith({ style: 'timeline' });
});
