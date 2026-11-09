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
  expect(host.querySelector('.num')?.textContent).toBe('0/ 10');
});

function week(start: string, sets: Record<string, number>): WeeklySets {
  return {
    ...weeklySets,
    week_start: start,
    muscle_groups: Object.entries(sets).map(([muscle_group, raw_sets]) => ({
      muscle_group,
      raw_sets,
      effective_sets: raw_sets,
      average_rpe: null,
      contributions: [],
    })),
  };
}

const rows = () =>
  [...host.querySelectorAll('.muscle-bars > li')].map((row) => [
    row.querySelector('.muscle-name-button')?.textContent,
    row.querySelector('.num')?.childNodes[0]?.textContent,
    row.querySelector('.muscle-set-change')?.textContent ?? null,
    row.querySelector('.muscle-bar-previous') !== null,
  ]);
const arrow = (label: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
const weekLabel = () => host.querySelector('.muscle-week-nav > span')?.textContent;

it('compares each muscle with the week before and steps back through earlier weeks', async () => {
  const thisWeek = week('2026-10-26', { Chest: 9, Quads: 8 });
  const history = [
    week('2026-10-19', { Chest: 12, Quads: 8, Calves: 4 }),
    week('2026-10-12', { Chest: 10, Quads: 9.5 }),
  ];
  await act(async () =>
    root.render(<MuscleSetsCard weeklySets={thisWeek} history={history} goal={10} />),
  );

  expect(weekLabel()).toBe('This week');
  expect(arrow('Next week').disabled).toBe(true);
  expect(host.querySelector('.muscle-set-goal-key')?.textContent).toBe(
    'Week of 26 OctWeek of 19 OctGoal 10',
  );
  // Calves were trained only the week before, so their drop still shows.
  expect(rows()).toEqual([
    ['Chest', '9', '−3', true],
    ['Quads', '8', '±0', true],
    ['Calves', '0', '−4', true],
  ]);

  await act(async () => arrow('Previous week').click());
  expect(weekLabel()).toBe('Last week');
  expect(rows()).toEqual([
    ['Chest', '12', '+2', true],
    ['Quads', '8', '−1.5', true],
    ['Calves', '4', '+4', false],
  ]);

  // The oldest week has nothing before it to compare with.
  await act(async () => arrow('Previous week').click());
  expect(weekLabel()).toBe('2 weeks ago');
  expect(arrow('Previous week').disabled).toBe(true);
  expect(host.querySelector('.muscle-set-goal-key')?.textContent).toBe('Week of 12 OctGoal 10');
  expect(rows()).toEqual([
    ['Chest', '10', null, false],
    ['Quads', '9.5', null, false],
  ]);
  expect(host.querySelector('.muscle-bars')?.getAttribute('aria-label')).toContain('2 weeks ago');

  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Exercises contributing to Chest"]')!
      .click(),
  );
  const dialog = document.querySelector('dialog')!;
  expect(dialog.textContent).toContain('2 WEEKS AGO');
  expect(dialog.textContent).toContain('set credits that week');
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Close Chest"]')!.click(),
  );

  await act(async () => arrow('Next week').click());
  await act(async () => arrow('Next week').click());
  expect(weekLabel()).toBe('This week');
});

it('keeps one bar scale across weeks so lengths stay comparable', async () => {
  const thisWeek = week('2026-10-26', { Chest: 5 });
  const history = [week('2026-10-19', { Chest: 20 })];
  await act(async () =>
    root.render(<MuscleSetsCard weeklySets={thisWeek} history={history} goal={10} />),
  );
  const width = (selector: string) =>
    host.querySelector<HTMLElement>(`.muscle-bars li ${selector}`)?.style.width;
  expect(width('.muscle-bar-previous')).toBe('100%');
  expect(width('i:not(.muscle-bar-previous)')).toBe('25%');
});

it('works without earlier weeks from an older cached dashboard', async () => {
  await act(async () => root.render(<MuscleSetsCard weeklySets={weeklySets} goal={10} />));
  expect(arrow('Previous week').disabled).toBe(true);
  expect(arrow('Next week').disabled).toBe(true);
  expect(host.querySelector('.muscle-set-change')).toBeNull();
  expect(host.querySelector('.muscle-bar-previous')).toBeNull();
});

it('scales each muscle to its own target and uses it in the contribution sheet', async () => {
  await act(async () =>
    root.render(
      <MuscleSetsCard
        weeklySets={week('2026-10-26', { Chest: 6, Quads: 6, Calves: 6 })}
        goal={10}
        goals={{ Chest: 18, Quads: 6 }}
      />,
    ),
  );
  const bars = [...host.querySelectorAll<HTMLElement>('.muscle-bar-track')];
  expect(bars.map((bar) => bar.getAttribute('aria-valuemax'))).toEqual(['10', '18', '6']);
  const byName = (name: string) =>
    bars.find((bar) => bar.getAttribute('aria-label') === `${name} weekly target`)!;
  expect(parseFloat(byName('Chest').querySelector('i')!.style.width)).toBeCloseTo(29, 0);
  expect(parseFloat(byName('Quads').querySelector('i')!.style.width)).toBeCloseTo(87, 0);
  expect(host.querySelector('.muscle-set-goal-key')?.textContent).toContain('Weekly target');
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Exercises contributing to Chest"]')!
      .click(),
  );
  const progress = document.querySelector('dialog [role="progressbar"]')!;
  expect(progress.getAttribute('aria-valuemax')).toBe('18');
  expect(progress.getAttribute('aria-valuetext')).toBe('6 of 18 sets');
});
