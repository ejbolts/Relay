// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { HeadToHeadCard, LiftLeaderboardCard } from './LiftComparison';
import { pageButtons } from './pageButtons';
import type { LiftBest, LiftComparison, LiftComparisons, LiftRanking } from './types';

const sam = { id: 'sam', display_name: 'Sam', profile_photo_url: null };
const alex = { id: 'alex', display_name: 'Alex', profile_photo_url: null };

function best(estimated_1rm: number, exercise_id = 'exercise', normalised = false): LiftBest {
  return {
    exercise_id,
    weight_kg: 100,
    reps: 5,
    estimated_1rm,
    achieved_date: '2026-01-01',
    normalised,
  };
}

function lift(name: string, yours: number | null, theirs: number | null): LiftComparison {
  return {
    exercise_id: `mine-${name}`,
    name,
    muscle_group: 'Chest',
    equipment: 'Barbell',
    yours: yours === null ? null : best(yours, `mine-${name}`),
    theirs: theirs === null ? null : best(theirs, `theirs-${name}`),
  };
}

function ranking(id: string, display_name: string, estimated_1rm: number): LiftRanking {
  return {
    member: { id, display_name, profile_photo_url: null },
    is_you: id === 'me',
    best: best(estimated_1rm),
  };
}

const LIFTS = [
  lift('Bench', 116.7, 121),
  lift('Curl', 40, null),
  lift('Deadlift', null, 200),
  lift('Row', 100, 100),
  lift('Squat', 154, 140),
];

/** What the server answers. Its saved choice of lifts is ignored, so it is never empty here. */
function comparisons(lifts = LIFTS): LiftComparisons {
  return { selected: ['mine-Row', 'mine-Bench'], lifts };
}

let root: Root;
let host: HTMLDivElement;

async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
}

function text(selector: string, within: ParentNode = document): string[] {
  return [...within.querySelectorAll(selector)].map((item) => item.textContent ?? '');
}

async function click(target: Element | null | undefined) {
  if (!target) throw new Error('Nothing to click');
  await act(async () => (target as HTMLElement).click());
}

async function openPicker() {
  await click(host.querySelector('.show-more-button'));
  const sheet = document.querySelector<HTMLDialogElement>('dialog.lift-picker');
  if (!sheet) throw new Error('The lift picker did not open');
  return sheet;
}

function option(sheet: ParentNode, name: string): HTMLButtonElement {
  const found = [...sheet.querySelectorAll<HTMLButtonElement>('.lift-picker-list button')].find(
    (item) => item.querySelector('strong')?.textContent === name,
  );
  if (!found) throw new Error(`No ${name} in the picker`);
  return found;
}

function button(within: ParentNode, label: string): HTMLButtonElement {
  const found = [...within.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => (item.getAttribute('aria-label') ?? item.textContent) === label,
  );
  if (!found) throw new Error(`No ${label} button`);
  return found;
}

/** Ticks the lifts in the picker, in order, and closes it. */
async function choose(...names: string[]) {
  const sheet = await openPicker();
  for (const name of names) await click(option(sheet, name));
  await click(sheet.querySelector('.popup-dialog-close'));
}

async function search(sheet: ParentNode, query: string) {
  const input = sheet.querySelector<HTMLInputElement>('.lift-picker-search input');
  if (!input) throw new Error('No search field');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setValue?.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  // Most tests close the sheet at once; the slide-down has its own test.
  document.documentElement.setAttribute('data-reduce-motion', '');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.documentElement.removeAttribute('data-reduce-motion');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('starts empty, with an outline of the card and the button that chooses lifts', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons());
  await render(<HeadToHeadCard member={sam} active />);

  expect(api.sharing.lifts).toHaveBeenCalledWith('sam');
  expect(host.querySelector('h2')?.textContent).toBe('Head to head');
  // The lifts the server once saved are not shown: every visit starts empty.
  expect(host.querySelector('.head-to-head-lifts')).toBeNull();
  expect(host.querySelector('.pulse-card-header span')).toBeNull();
  const template = host.querySelector('.head-to-head-template');
  expect(template?.getAttribute('aria-hidden')).toBe('true');
  expect(template?.querySelector('.head-to-head-score')?.textContent).toBe('You?–?SamS');
  expect(template?.querySelectorAll('.head-to-head-ghost-bar')).toHaveLength(1);
  expect(text('button', host)).toEqual(['Choose lifts']);
});

it('compares the chosen lifts in the order they were added and scores who leads', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons());
  await render(<HeadToHeadCard member={sam} active />);
  await choose('Squat', 'Bench', 'Row', 'Curl', 'Deadlift');

  expect(host.querySelector('.head-to-head-template')).toBeNull();
  expect(text('.head-to-head-values > span', host)).toEqual([
    'Squat',
    'Bench',
    'Row',
    'Curl',
    'Deadlift',
  ]);
  expect(
    [...host.querySelectorAll('.head-to-head-lifts li')].map((item) =>
      item.getAttribute('data-leader'),
    ),
  ).toEqual(['you', 'them', 'level', 'none', 'none']);
  // Lifts only one of you has logged are shown but not scored.
  expect(host.querySelector('.head-to-head-score')?.getAttribute('aria-label')).toBe(
    'You lead 1 lift, Sam leads 1 lift, 1 lift level',
  );
  expect(host.querySelector('.head-to-head-score strong')?.textContent).toBe('1–1');
  expect(host.querySelector('.head-to-head-score .ahead')).toBeNull();
  expect(text('.head-to-head-values', host)[1]).toBe('116.7 kgBench121 kg');
  expect(text('.head-to-head-values', host)[3]).toBe('40 kgCurl–');
  expect(text('.head-to-head-sets', host)[4]).toBe('No sets yet100 kg × 5');
  // Each bar splits by the two estimates; a one-sided lift has a single empty track.
  const bars = [...host.querySelectorAll('.head-to-head-bar')];
  const first = bars[0].querySelector<HTMLElement>('i');
  expect(Number.parseFloat(first?.style.width ?? '')).toBeCloseTo((154 / 294) * 100);
  expect(bars[3].querySelectorAll('i')).toHaveLength(1);
  expect(text('.show-more-button', host)).toEqual(['Edit lifts']);
});

it('highlights only the side that leads overall', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons());
  await render(<HeadToHeadCard member={sam} active />);
  await choose('Squat', 'Row');
  expect(text('.head-to-head-score .ahead', host)).toEqual(['You', '1']);
});

it('opens the member’s sessions of a lift they have logged, by their own exercise', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons());
  const onOpenLift = vi.fn();
  await render(<HeadToHeadCard member={sam} active onOpenLift={onOpenLift} />);
  await choose('Bench', 'Curl');
  const rows = [...host.querySelectorAll('.head-to-head-lifts li')];
  const bench = rows[0].querySelector('button');
  expect(bench?.getAttribute('aria-label')).toBe(
    'Bench: you 116.7 kg, Sam 121 kg. Show Sam’s sessions',
  );
  await click(bench);
  expect(onOpenLift).toHaveBeenCalledWith('theirs-Bench');
  // Sam has no sessions of a lift they never logged.
  expect(rows[1].querySelector('button')).toBeNull();
  expect(rows[1].firstElementChild?.getAttribute('aria-label')).toBe(
    'Curl: you 40 kg, Sam no sets yet',
  );
});

it('marks normalised machine weights as approximate', async () => {
  const pulldown = lift('Pulldown', 106.7, 80);
  pulldown.theirs = best(80, 'theirs-Pulldown', true);
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons([pulldown]));
  await render(<HeadToHeadCard member={sam} active />);
  await choose('Pulldown');
  expect(text('.head-to-head-values', host)).toEqual(['106.7 kgPulldown≈ 80 kg']);
  expect(text('.head-to-head-sets', host)).toEqual(['100 kg × 5≈ 100 kg × 5']);
});

it('lists your exercises with the member’s best beside the ones they have logged', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons());
  await render(<HeadToHeadCard member={sam} active />);
  await choose('Row');
  const sheet = await openPicker();

  expect(sheet.querySelector('h2')?.textContent).toBe('Lifts to compare');
  // Chosen lifts lead, then the ones you have both logged, then Sam's, then yours.
  expect(text('.lift-picker-copy strong', sheet)).toEqual([
    'Row',
    'Bench',
    'Squat',
    'Deadlift',
    'Curl',
  ]);
  expect(
    [...sheet.querySelectorAll('.lift-picker-list button')].map((item) =>
      item.getAttribute('aria-pressed'),
    ),
  ).toEqual(['true', 'false', 'false', 'false', 'false']);
  expect(sheet.querySelector('.lift-picker-toolbar span')?.textContent).toBe('1 of 20 chosen');
  // Each row shows both estimates, for whoever has logged the lift.
  expect(text('.lift-picker-best', option(sheet, 'Bench'))).toEqual([
    'You: 116.7 kg',
    'Sam: S121 kg',
  ]);
  expect(text('.lift-picker-best', option(sheet, 'Curl'))).toEqual(['You: 40 kg']);
  expect(text('.lift-picker-best', option(sheet, 'Deadlift'))).toEqual(['Sam: S200 kg']);
  // Five lifts fit on one page, so there are no page buttons.
  expect(sheet.querySelector('.lift-picker-pager')).toBeNull();

  await search(sheet, 'squat');
  expect(text('.lift-picker-copy strong', sheet)).toEqual(['Squat']);
  await search(sheet, 'zzz');
  expect(sheet.querySelector('.lift-picker-empty')?.textContent).toBe('No exercises match “zzz”.');
});

it('shows the lifts you tick or untick when the sheet closes, and saves none of them', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons());
  const fetch = vi.spyOn(globalThis, 'fetch');
  await render(<HeadToHeadCard member={sam} active />);
  await choose('Row');
  const sheet = await openPicker();

  await click(option(sheet, 'Bench'));
  expect(option(sheet, 'Bench').getAttribute('aria-pressed')).toBe('true');
  // Ticking does not move the lift while the sheet is open.
  expect(text('.lift-picker-copy strong', sheet).slice(0, 2)).toEqual(['Row', 'Bench']);

  await click(option(sheet, 'Row'));
  await click(option(sheet, 'Squat'));
  // The card behind keeps what it showed until the sheet closes.
  expect(text('.head-to-head-values > span', host)).toEqual(['Row']);

  await click(sheet.querySelector('.popup-dialog-close'));
  expect(document.querySelector('dialog.lift-picker')).toBeNull();
  expect(text('.head-to-head-values > span', host)).toEqual(['Bench', 'Squat']);
  // The lifts that were added arrive one after another.
  const rows = [...host.querySelectorAll<HTMLElement>('.head-to-head-lifts li')];
  expect(rows.map((row) => row.className)).toEqual(['is-new', 'is-new']);
  expect(rows.map((row) => row.style.getPropertyValue('--enter-delay'))).toEqual(['0ms', '80ms']);
  expect(text('.show-more-button', host)).toEqual(['Edit lifts']);

  // A lift that stays is not treated as new the next time.
  await choose('Squat');
  expect(text('.head-to-head-values > span', host)).toEqual(['Bench']);
  expect(host.querySelector('.head-to-head-lifts li.is-new')).toBeNull();
  // The choice belongs to this visit: nothing is sent to the server.
  expect(fetch).not.toHaveBeenCalled();
});

it('counts every lift ticked in quick succession', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons());
  await render(<HeadToHeadCard member={sam} active />);
  const sheet = await openPicker();
  // Taps landing before the sheet redraws each build on the one before.
  await act(async () => {
    option(sheet, 'Bench').click();
    option(sheet, 'Squat').click();
    option(sheet, 'Row').click();
  });
  expect(sheet.querySelector('.lift-picker-toolbar span')?.textContent).toBe('3 of 20 chosen');
  await click(sheet.querySelector('.popup-dialog-close'));
  expect(text('.head-to-head-values > span', host)).toEqual(['Bench', 'Squat', 'Row']);
});

it('starts empty again on another member’s profile and when a profile opens again', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons());
  await render(<HeadToHeadCard key="sam-1" member={sam} active />);
  await choose('Bench', 'Squat');
  expect(text('.head-to-head-values > span', host)).toEqual(['Bench', 'Squat']);

  // Profiles key the card by member, and opening a profile again remounts it.
  await render(<HeadToHeadCard key="alex-1" member={alex} active />);
  expect(api.sharing.lifts).toHaveBeenLastCalledWith('alex');
  expect(host.querySelector('.head-to-head-lifts')).toBeNull();
  expect(host.querySelector('.head-to-head-template')).not.toBeNull();

  await render(<HeadToHeadCard key="sam-2" member={sam} active />);
  expect(host.querySelector('.head-to-head-lifts')).toBeNull();
  expect(text('button', host)).toEqual(['Choose lifts']);
});

it('keeps the chosen lifts when the comparison reloads during a visit', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons());
  await render(<HeadToHeadCard member={sam} active revision="1" />);
  await choose('Bench');
  await render(<HeadToHeadCard member={sam} active revision="2" />);
  expect(api.sharing.lifts).toHaveBeenCalledTimes(2);
  expect(text('.head-to-head-values > span', host)).toEqual(['Bench']);
});

it('unselects every lift at once, with Undo for a few seconds', async () => {
  vi.useFakeTimers();
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons());
  await render(<HeadToHeadCard member={sam} active />);
  const sheet = await openPicker();
  const unselect = button(sheet, 'Unselect all');
  expect(unselect.disabled).toBe(true);

  await click(option(sheet, 'Bench'));
  await click(option(sheet, 'Squat'));
  expect(unselect.disabled).toBe(false);
  await click(unselect);
  expect(sheet.querySelector('.lift-picker-toolbar span')?.textContent).toBe('0 of 20 chosen');
  expect(sheet.querySelectorAll('.lift-picker-list [aria-pressed="true"]')).toHaveLength(0);
  expect(unselect.disabled).toBe(true);

  // Undo puts back the lifts it cleared, in their order.
  const toast = sheet.querySelector('.lift-picker-toast');
  expect(toast?.querySelector('span')?.textContent).toBe('Lifts cleared');
  await click(button(sheet, 'Undo'));
  expect(sheet.querySelector('.lift-picker-toast')).toBeNull();
  expect(sheet.querySelector('.lift-picker-toolbar span')?.textContent).toBe('2 of 20 chosen');

  // The offer goes after a few seconds, or as soon as you tick another lift.
  await click(unselect);
  await act(async () => vi.advanceTimersByTime(4000));
  expect(sheet.querySelector('.lift-picker-toast')).toBeNull();
  await click(option(sheet, 'Row'));
  await click(unselect);
  await click(option(sheet, 'Curl'));
  expect(sheet.querySelector('.lift-picker-toast')).toBeNull();

  await click(sheet.querySelector('.popup-dialog-close'));
  expect(text('.head-to-head-values > span', host)).toEqual(['Curl']);
});

it('pages through the lifts, six at a time, and back to the first page on a search', async () => {
  const many = Array.from({ length: 16 }, (_, index) =>
    lift(`Lift ${String(index + 1).padStart(2, '0')}`, 100, null),
  );
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons(many));
  await render(<HeadToHeadCard member={sam} active />);
  const sheet = await openPicker();

  expect(text('.lift-picker-copy strong', sheet)).toHaveLength(6);
  expect(text('.lift-picker-copy strong', sheet)[0]).toBe('Lift 01');
  const pager = sheet.querySelector('.lift-picker-pager');
  expect(text('button', pager ?? undefined)).toEqual(['', '1', '2', '3', '']);
  expect(button(sheet, 'Page 1 of 3').getAttribute('aria-current')).toBe('page');
  expect(button(sheet, 'Previous page').disabled).toBe(true);

  await click(button(sheet, 'Next page'));
  expect(text('.lift-picker-copy strong', sheet)[0]).toBe('Lift 07');
  await click(option(sheet, 'Lift 10'));
  await click(button(sheet, 'Page 3 of 3'));
  expect(text('.lift-picker-copy strong', sheet)).toEqual([
    'Lift 13',
    'Lift 14',
    'Lift 15',
    'Lift 16',
  ]);
  expect(button(sheet, 'Next page').disabled).toBe(true);
  expect(sheet.querySelector('.lift-picker-toolbar span')?.textContent).toBe('1 of 20 chosen');

  await search(sheet, 'Lift 0');
  expect(text('.lift-picker-copy strong', sheet)[0]).toBe('Lift 01');
  expect(button(sheet, 'Page 1 of 2').getAttribute('aria-current')).toBe('page');

  await click(sheet.querySelector('.popup-dialog-close'));
  expect(text('.head-to-head-values > span', host)).toEqual(['Lift 10']);
});

it('offers the first, last and nearby pages when there are many', () => {
  expect(pageButtons(0, 3)).toEqual([0, 1, 2]);
  expect(pageButtons(3, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(pageButtons(0, 13)).toEqual([0, 1, 2, 3, null, 12]);
  expect(pageButtons(2, 13)).toEqual([0, 1, 2, 3, null, 12]);
  expect(pageButtons(6, 13)).toEqual([0, null, 5, 6, 7, null, 12]);
  expect(pageButtons(12, 13)).toEqual([0, null, 9, 10, 11, 12]);
  expect(pageButtons(10, 13)).toEqual([0, null, 9, 10, 11, 12]);
});

it('slides the sheet down before it closes, unless motion is reduced', async () => {
  document.documentElement.removeAttribute('data-reduce-motion');
  vi.useFakeTimers();
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons());
  await render(<HeadToHeadCard member={sam} active />);
  const sheet = await openPicker();
  expect(sheet.classList).toContain('popup-dialog--sheet');
  expect(sheet.classList).toContain('popup-dialog--tall');
  expect(sheet.querySelector('header > .sheet-grabber')).not.toBeNull();
  // The standard × closes it; there is no "Done" text.
  const close = sheet.querySelector('.popup-dialog-close')!;
  expect(close.textContent).toBe('');
  expect(close.querySelector('.pulse-icon')).not.toBeNull();
  await click(option(sheet, 'Bench'));

  await click(close);
  expect(sheet.classList.contains('is-closing')).toBe(true);
  expect(document.querySelector('dialog.lift-picker')).not.toBeNull();
  expect(host.querySelector('.head-to-head-lifts')).toBeNull();

  await act(async () => vi.advanceTimersByTime(240));
  expect(document.querySelector('dialog.lift-picker')).toBeNull();
  expect(text('.head-to-head-values > span', host)).toEqual(['Bench']);
});

it('shows no head to head while inactive or when it cannot load', async () => {
  const lifts = vi.spyOn(api.sharing, 'lifts').mockRejectedValue(new Error('offline'));
  await render(<HeadToHeadCard member={sam} active />);
  expect(host.innerHTML).toBe('');

  lifts.mockClear();
  await render(<HeadToHeadCard key="inactive" member={sam} active={false} />);
  expect(lifts).not.toHaveBeenCalled();
  expect(host.innerHTML).toBe('');
});

it('ranks you among friends and opens a friend’s profile', async () => {
  vi.spyOn(api.sharing, 'liftLeaderboard').mockResolvedValue({
    entries: [ranking('sam', 'Sam', 121), ranking('me', 'Owner', 116.7)],
  });
  const onOpenMember = vi.fn();
  await render(<LiftLeaderboardCard exerciseId="bench" onOpenMember={onOpenMember} />);

  expect(api.sharing.liftLeaderboard).toHaveBeenCalledWith('bench');
  expect(text('.lift-leaderboard-name strong', host)).toEqual(['Sam', 'You']);
  expect(text('.lift-leaderboard li > * > b', host)).toEqual(['121 kg', '116.7 kg']);
  expect(text('.lift-leaderboard-name small', host)).toEqual(['100 kg × 5', '100 kg × 5']);
  // Only friends open a profile; your own row is not a button.
  const rows = [...host.querySelectorAll('.lift-leaderboard li')];
  expect(rows.map((row) => row.className)).toEqual(['', 'is-you']);
  expect(rows[1].querySelector('button')).toBeNull();
  await click(rows[0].querySelector('button'));
  expect(onOpenMember).toHaveBeenCalledWith(expect.objectContaining({ id: 'sam' }));
});

it('drops the previous lift’s ranking while another lift loads, and hides when empty', async () => {
  let answer: (value: { entries: LiftRanking[] }) => void = () => undefined;
  const board = vi
    .spyOn(api.sharing, 'liftLeaderboard')
    .mockResolvedValueOnce({ entries: [ranking('sam', 'Sam', 121)] })
    .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
  await render(<LiftLeaderboardCard exerciseId="bench" />);
  expect(text('.lift-leaderboard-name strong', host)).toEqual(['Sam']);

  await render(<LiftLeaderboardCard exerciseId="squat" />);
  expect(host.innerHTML).toBe('');
  await act(async () => answer({ entries: [] }));
  expect(host.innerHTML).toBe('');

  board.mockRejectedValueOnce(new Error('sharing_required'));
  await render(<LiftLeaderboardCard exerciseId="row" />);
  expect(host.innerHTML).toBe('');
});
