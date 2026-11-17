// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { TrainingBlocksProvider } from './TrainingBlocksProvider';
import { addDays } from './trainingSummary';
import { WeeklyReviewBlock } from './WeeklyReviewBlock';
import { reviewRecord, reviewSet, reviewWorkout } from './weeklyReviewFixtures';
import type { BodyWeightGoal, PersonalRecord, TrackedWorkout, TrainingBlock } from './types';

const TODAY = '2026-11-18';
let host: HTMLDivElement;
let root: Root;

/** Monday and Tuesday sessions for each of the weeks ending with this one. */
const steady = (weeks: number): TrackedWorkout[] =>
  Array.from({ length: weeks }, (_, index) => {
    const monday = addDays('2026-11-16', -index * 7);
    return [monday, addDays(monday, 1)].map((date) =>
      reviewWorkout(date, date, [reviewSet(100, 5)]),
    );
  }).flat();

const block = (name: string, start: string, extra: Partial<TrainingBlock> = {}): TrainingBlock => ({
  id: name,
  name,
  start_date: start,
  end_date: null,
  ...extra,
});

const goal = (created: string, start: number, target: number): BodyWeightGoal => ({
  id: created,
  created_at: `${created}T08:00:00Z`,
  start_date: created,
  target_date: addDays(created, 84),
  start_weight_kg: start,
  target_weight_kg: target,
  maintenance_min_kg: null,
  maintenance_max_kg: null,
  active: true,
});

async function render({
  workouts = steady(6),
  records = [],
  blocks = [],
  goals = [],
}: {
  workouts?: TrackedWorkout[];
  records?: PersonalRecord[];
  blocks?: TrainingBlock[];
  goals?: BodyWeightGoal[];
} = {}) {
  vi.spyOn(api.trainingBlocks, 'get').mockResolvedValue({ blocks });
  vi.spyOn(api, 'listBodyWeightGoals').mockResolvedValue(goals);
  await act(async () =>
    root.render(
      <TrainingBlocksProvider>
        <WeeklyReviewBlock workouts={workouts} records={records} today={TODAY} />
      </TrainingBlocksProvider>,
    ),
  );
}

const text = () => host.textContent ?? '';
const button = (label: string) =>
  [...host.querySelectorAll('button')].find((item) => item.textContent === label);

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
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

it('stays out of the review until there is a block or a reason to start one', async () => {
  await render({ workouts: steady(2) });
  expect(text()).toBe('');
});

it('offers a first block after four weeks of training', async () => {
  await render();
  expect(text()).toBe('Training block6 weeks trained, no block yetStart a block');
});

it('shows where the running block is up to, with nothing to act on', async () => {
  await render({
    blocks: [block('Winter strength', '2026-10-26', { planned_end_date: '2026-12-20' })],
  });
  expect(text()).toBe('Training blockWeek 4 of 8Winter strength');
  expect(host.querySelector('button')).toBeNull();
});

it('offers a new block on returning from a break, beside the block still running', async () => {
  await render({
    workouts: [
      ...steady(8).filter((workout) => workout.workout_date < '2026-11-02'),
      reviewWorkout('back', '2026-11-17', [reviewSet(100, 5)]),
    ],
    blocks: [block('Summer cut', '2026-08-03')],
  });
  expect(text()).toContain('Summer cut');
  // Last trained on 27 October, back on 17 November.
  expect(text()).toContain('Back after 20 days off');
  expect(button('Start a new block')).toBeDefined();
});

it('offers a block when the weight goal has just changed direction', async () => {
  await render({
    blocks: [block('Summer cut', '2026-08-03')],
    goals: [goal('2026-08-03', 90, 82), goal('2026-11-10', 82, 86)],
  });
  expect(text()).toContain('New weight goal');
});

it('offers a block when the records have dried up', async () => {
  await render({
    blocks: [block('Summer cut', '2026-08-03')],
    records: ['2026-10-10', '2026-10-14', '2026-10-20'].map((date) => reviewRecord(date, date)),
  });
  expect(text()).toContain('No new records for 3 weeks');
});

it('starts the block from the review and then shows it running', async () => {
  const started = block('Winter strength', TODAY);
  await render();
  vi.spyOn(api.trainingBlocks, 'create').mockResolvedValue({ blocks: [started] });
  await act(async () => button('Start a block')!.click());
  const dialog = document.querySelector('dialog[open]')!;
  expect(dialog.textContent).toContain('New training block');
  const name = dialog.querySelector<HTMLInputElement>('.training-block-form input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      name,
      'Winter strength',
    );
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    dialog
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(api.trainingBlocks.create).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Winter strength' }),
  );
  expect(document.querySelector('dialog[open]')).toBeNull();
  // The new block is the new phase, so the offer is gone.
  expect(text()).toBe('Training blockWeek 1Winter strength');
});
