// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MuscleSetsCard } from './MuscleSetsCard';
import type { WeeklyMuscleContribution, WeeklySets } from './types';

let root: Root;
let host: HTMLDivElement;
const contribution: WeeklyMuscleContribution = {
  workout_id: 'upper',
  workout_name: 'Upper body',
  workout_date: '2026-10-19',
  movement_id: 'curl-1',
  exercise_id: 'curl',
  exercise_name: 'Barbell Curl',
  working_sets: 3,
  credit_per_set: 1,
  set_credits: 3,
};
const weeklySets: WeeklySets = {
  week_start: '2026-10-19',
  week_end: '2026-10-25',
  raw_sets: 9,
  effective_sets: 6,
  unrated_sets: 0,
  low_rpe_sets: 0,
  rpe_logging_percent: 100,
  muscle_groups: [
    {
      muscle_group: 'Biceps',
      raw_sets: 6,
      effective_sets: 6,
      average_rpe: 8,
      contributions: [
        contribution,
        {
          ...contribution,
          workout_id: 'pull',
          workout_name: 'Pull day',
          movement_id: 'curl-2',
          working_sets: 6,
          credit_per_set: 0.5,
          set_credits: 3,
        },
      ],
    },
  ],
};
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(
  onOpenWorkout = vi.fn<(item: WeeklyMuscleContribution) => void | Promise<void>>(),
  data = weeklySets,
  goal = 10,
) {
  await act(async () =>
    root.render(<MuscleSetsCard weeklySets={data} goal={goal} onOpenWorkout={onOpenWorkout} />),
  );
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Exercises contributing to Biceps"]')!
      .click(),
  );
  return onOpenWorkout;
}
it('opens the chosen bottom sheet with credits, goal and distinct exercise links to their source workouts', async () => {
  const open = await render();
  const dialog = document.querySelector('dialog[open]')!;
  expect(dialog.classList).toContain('muscle-contribution-sheet');
  expect(dialog.textContent).toContain('3 working sets × 1 · Direct');
  expect(dialog.textContent).toContain('6 working sets × 0.5 · Assistance');
  expect(dialog.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('6');
  expect(dialog.querySelectorAll('.muscle-contribution-copy strong > svg')).toHaveLength(2);
  const links = dialog.querySelectorAll<HTMLButtonElement>('.muscle-contribution-list button');
  expect(links[1].getAttribute('aria-label')).toContain('Pull day');
  await act(async () => links[1].click());
  expect(open).toHaveBeenCalledExactlyOnceWith(weeklySets.muscle_groups[0].contributions![1]);
  expect(document.querySelector('dialog')).toBeNull();
});
it('retains the sheet on a failed workout open, prevents repeat requests and allows retry', async () => {
  let reject!: (reason: Error) => void;
  const open = vi
    .fn<(item: WeeklyMuscleContribution) => Promise<void>>()
    .mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    )
    .mockResolvedValueOnce(undefined);
  await render(open);
  await act(async () =>
    document.querySelector<HTMLButtonElement>('.muscle-contribution-list button')!.click(),
  );
  expect(
    [...document.querySelectorAll<HTMLButtonElement>('.muscle-contribution-list button')].every(
      (button) => button.disabled,
    ),
  ).toBe(true);
  expect(document.querySelector('[role="status"]')?.textContent).toContain('Opening workout');
  await act(async () => reject(new Error('Workout unavailable')));
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Workout unavailable');
  await act(async () =>
    document.querySelector<HTMLButtonElement>('.muscle-contribution-list button')!.click(),
  );
  expect(open).toHaveBeenCalledTimes(2);
  expect(document.querySelector('dialog')).toBeNull();
});
it('keeps totals honest for old cached dashboards and caps a completed goal without hiding its total', async () => {
  const legacy = {
    ...weeklySets,
    muscle_groups: [{ ...weeklySets.muscle_groups[0], contributions: undefined }],
  };
  await render(undefined, legacy, 5);
  expect(document.querySelector('dialog')?.textContent).toContain('Refresh Home');
  const bar = document.querySelector('[role="progressbar"]')!;
  expect(bar.getAttribute('aria-valuenow')).toBe('5');
  expect(bar.getAttribute('aria-valuetext')).toBe('6 of 5 sets');
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Close Biceps"]')!.click(),
  );
  expect(document.querySelector('dialog')).toBeNull();
});

it('shows eight trained muscles initially and expands to the remaining trained and untrained muscles', async () => {
  const data = {
    ...weeklySets,
    muscle_groups: Array.from({ length: 12 }, (_, index) => ({
      ...weeklySets.muscle_groups[0],
      muscle_group: `Muscle ${index}`,
      raw_sets: index < 10 ? 12 - index : 0,
      contributions: [],
    })),
  };
  await act(async () => root.render(<MuscleSetsCard weeklySets={data} goal={10} />));
  expect(host.querySelectorAll('.muscle-bars > li')).toHaveLength(8);
  const expand = host.querySelector<HTMLButtonElement>('.muscle-sets-expand')!;
  expect(expand.textContent).toContain('Show more');
  await act(async () => expand.click());
  expect(host.querySelectorAll('.muscle-bars > li')).toHaveLength(12);
  expect(expand.getAttribute('aria-expanded')).toBe('true');
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Exercises contributing to Muscle 10"]')!
      .click(),
  );
  expect(document.querySelector('dialog')?.textContent).toContain(
    'No working sets for this muscle',
  );
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Close Muscle 10"]')!.click(),
  );
  await act(async () => expand.click());
  expect(host.querySelectorAll('.muscle-bars > li')).toHaveLength(8);
});

it('can reveal untrained muscles before the first workout of the week', async () => {
  const data = {
    ...weeklySets,
    muscle_groups: [{ ...weeklySets.muscle_groups[0], raw_sets: 0, contributions: [] }],
  };
  await act(async () => root.render(<MuscleSetsCard weeklySets={data} goal={10} />));
  expect(host.textContent).toContain('No working sets logged yet');
  await act(async () => host.querySelector<HTMLButtonElement>('.muscle-sets-expand')!.click());
  expect(host.querySelectorAll('.muscle-bars > li')).toHaveLength(1);
  expect(host.querySelector('.num')?.textContent).toBe('0');
});
