// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { HeadToHeadCard, LiftLeaderboardCard } from './LiftComparison';
import type { LiftBest, LiftComparison, LiftComparisons, LiftRanking } from './types';

const sam = { id: 'sam', display_name: 'Sam', profile_photo_url: null };

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

function comparisons(...selected: string[]): LiftComparisons {
  return { selected: selected.map((name) => `mine-${name}`), lifts: LIFTS };
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

it('starts with no lifts and only the button that chooses them', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons());
  await render(<HeadToHeadCard member={sam} active />);

  expect(api.sharing.lifts).toHaveBeenCalledWith('sam');
  expect(host.querySelector('h2')?.textContent).toBe('Head to head');
  expect(host.querySelector('.head-to-head-score')).toBeNull();
  expect(host.querySelector('.head-to-head-lifts')).toBeNull();
  expect(host.querySelector('.pulse-card-header span')).toBeNull();
  expect(text('button', host)).toEqual(['Choose lifts']);
});

it('compares the chosen lifts in the order they were added and scores who leads', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(
    comparisons('Squat', 'Bench', 'Row', 'Curl', 'Deadlift'),
  );
  await render(<HeadToHeadCard member={sam} active />);

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
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons('Squat', 'Row'));
  await render(<HeadToHeadCard member={sam} active />);
  expect(text('.head-to-head-score .ahead', host)).toEqual(['You', '1']);
});

it('opens the member’s sessions of a lift they have logged, by their own exercise', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons('Bench', 'Curl'));
  const onOpenLift = vi.fn();
  await render(<HeadToHeadCard member={sam} active onOpenLift={onOpenLift} />);
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
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue({
    selected: ['mine-Pulldown'],
    lifts: [pulldown],
  });
  await render(<HeadToHeadCard member={sam} active />);
  expect(text('.head-to-head-values', host)).toEqual(['106.7 kgPulldown≈ 80 kg']);
  expect(text('.head-to-head-sets', host)).toEqual(['100 kg × 5≈ 100 kg × 5']);
});

it('lists your exercises with the member’s best beside the ones they have logged', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons('Row'));
  await render(<HeadToHeadCard member={sam} active />);
  const sheet = await openPicker();

  expect(sheet.querySelector('h2')?.textContent).toBe('Lifts to compare');
  // Chosen lifts lead, then the ones Sam has logged, then the rest.
  expect(text('.lift-picker-copy strong', sheet)).toEqual([
    'Row',
    'Bench',
    'Deadlift',
    'Squat',
    'Curl',
  ]);
  expect(
    [...sheet.querySelectorAll('.lift-picker-list button')].map((item) =>
      item.getAttribute('aria-pressed'),
    ),
  ).toEqual(['true', 'false', 'false', 'false', 'false']);
  expect(option(sheet, 'Bench').querySelector('.lift-picker-preview')?.textContent).toBe(
    'Sam: S121 kg100 kg × 5',
  );
  expect(option(sheet, 'Curl').querySelector('.lift-picker-preview')).toBeNull();

  await search(sheet, 'squat');
  expect(text('.lift-picker-copy strong', sheet)).toEqual(['Squat']);
  await search(sheet, 'zzz');
  expect(sheet.querySelector('[role="status"]')?.textContent).toBe('No exercises match “zzz”.');
});

it('saves each lift you tick or untick and shows the change when the sheet closes', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons('Row'));
  const save = vi
    .spyOn(api.sharing, 'chooseLifts')
    .mockImplementation(async (exercise_ids) => ({ exercise_ids }));
  await render(<HeadToHeadCard member={sam} active />);
  const sheet = await openPicker();

  await click(option(sheet, 'Bench'));
  expect(save).toHaveBeenLastCalledWith(['mine-Row', 'mine-Bench']);
  expect(option(sheet, 'Bench').getAttribute('aria-pressed')).toBe('true');
  // Ticking does not move the lift while the sheet is open.
  expect(text('.lift-picker-copy strong', sheet).slice(0, 2)).toEqual(['Row', 'Bench']);

  await click(option(sheet, 'Row'));
  expect(save).toHaveBeenLastCalledWith(['mine-Bench']);
  await click(option(sheet, 'Squat'));
  expect(save).toHaveBeenLastCalledWith(['mine-Bench', 'mine-Squat']);
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
  const again = await openPicker();
  await click(option(again, 'Squat'));
  await click(again.querySelector('.popup-dialog-close'));
  expect(text('.head-to-head-values > span', host)).toEqual(['Bench']);
  expect(host.querySelector('.head-to-head-lifts li.is-new')).toBeNull();
});

it('puts a lift back when it could not be saved', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons('Row'));
  vi.spyOn(api.sharing, 'chooseLifts').mockRejectedValue(new Error('offline'));
  await render(<HeadToHeadCard member={sam} active />);
  const sheet = await openPicker();

  await click(option(sheet, 'Bench'));
  expect(sheet.querySelector('[role="alert"]')?.textContent).toBe(
    'Your lifts could not be saved. Try again.',
  );
  expect(option(sheet, 'Bench').getAttribute('aria-pressed')).toBe('false');
  await click(sheet.querySelector('.popup-dialog-close'));
  expect(text('.head-to-head-values > span', host)).toEqual(['Row']);
  expect(host.querySelector('.head-to-head-lifts li.is-new')).toBeNull();
});

it('slides the sheet down before it closes, unless motion is reduced', async () => {
  document.documentElement.removeAttribute('data-reduce-motion');
  vi.useFakeTimers();
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue(comparisons('Row'));
  vi.spyOn(api.sharing, 'chooseLifts').mockImplementation(async (exercise_ids) => ({
    exercise_ids,
  }));
  await render(<HeadToHeadCard member={sam} active />);
  const sheet = await openPicker();
  await click(option(sheet, 'Bench'));

  await click(sheet.querySelector('.popup-dialog-close'));
  expect(sheet.classList.contains('is-closing')).toBe(true);
  expect(document.querySelector('dialog.lift-picker')).not.toBeNull();
  expect(text('.head-to-head-values > span', host)).toEqual(['Row']);

  await act(async () => vi.advanceTimersByTime(240));
  expect(document.querySelector('dialog.lift-picker')).toBeNull();
  expect(text('.head-to-head-values > span', host)).toEqual(['Row', 'Bench']);
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
