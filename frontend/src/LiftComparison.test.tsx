// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { HeadToHeadCard, LiftLeaderboardCard } from './LiftComparison';
import type { LiftBest, LiftComparison, LiftRanking } from './types';

const sam = { id: 'sam', display_name: 'Sam', profile_photo_url: null };

function best(estimated_1rm: number, exercise_id = 'exercise'): LiftBest {
  return { exercise_id, weight_kg: 100, reps: 5, estimated_1rm, achieved_date: '2026-01-01' };
}

function lift(name: string, yours: number, theirs: number): LiftComparison {
  return {
    name,
    muscle_group: 'Chest',
    yours: best(yours, `mine-${name}`),
    theirs: best(theirs, `theirs-${name}`),
  };
}

function ranking(id: string, display_name: string, estimated_1rm: number): LiftRanking {
  return {
    member: { id, display_name, profile_photo_url: null },
    is_you: id === 'me',
    best: best(estimated_1rm),
  };
}

let root: Root;
let host: HTMLDivElement;

async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
}

function text(selector: string): string[] {
  return [...host.querySelectorAll(selector)].map((item) => item.textContent ?? '');
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

it('scores the lifts each member leads and marks every leader', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue({
    lifts: [lift('Back Squat', 154, 140), lift('Bench', 116.7, 121), lift('Row', 100, 100)],
  });
  await render(<HeadToHeadCard member={sam} active />);

  expect(api.sharing.lifts).toHaveBeenCalledWith('sam');
  expect(host.querySelector('.head-to-head-score')?.getAttribute('aria-label')).toBe(
    'You lead 1 lift, Sam leads 1 lift, 1 lift level',
  );
  expect(host.querySelector('.head-to-head-score strong')?.textContent).toBe('1–1');
  expect(
    [...host.querySelectorAll('.head-to-head-lifts li')].map((item) =>
      item.getAttribute('data-leader'),
    ),
  ).toEqual(['you', 'them', 'level']);
  expect(text('.head-to-head-values')[1]).toBe('116.7 kgBench121 kg');
  // Each bar splits by the two estimates.
  const bar = host.querySelector<HTMLElement>('.head-to-head-bar i');
  expect(Number.parseFloat(bar?.style.width ?? '')).toBeCloseTo((154 / 294) * 100);
});

it('opens the member’s sessions of a lift by their own exercise', async () => {
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue({ lifts: [lift('Bench', 116.7, 121)] });
  const onOpenLift = vi.fn();
  await render(<HeadToHeadCard member={sam} active onOpenLift={onOpenLift} />);
  const row = host.querySelector<HTMLButtonElement>('.head-to-head-lifts button');
  expect(row?.getAttribute('aria-label')).toBe(
    'Bench: you 116.7 kg, Sam 121 kg. Show Sam’s sessions',
  );
  await act(async () => row?.click());
  expect(onOpenLift).toHaveBeenCalledWith('theirs-Bench');
});

it('shows five lifts until the rest are asked for', async () => {
  const lifts = Array.from({ length: 7 }, (_, index) => lift(`Lift ${index + 1}`, 100, 90));
  vi.spyOn(api.sharing, 'lifts').mockResolvedValue({ lifts });
  await render(<HeadToHeadCard member={sam} active />);
  expect(host.querySelectorAll('.head-to-head-lifts li')).toHaveLength(5);
  // The score still counts every lift.
  expect(host.querySelector('.head-to-head-score strong')?.textContent).toBe('7–0');
  // Only the side that leads overall is highlighted.
  expect(text('.head-to-head-score .ahead')).toEqual(['You', '7']);
  const more = host.querySelector<HTMLButtonElement>('.show-more-button');
  expect(more?.textContent).toBe('Show all 7 lifts');
  await act(async () => more?.click());
  expect(host.querySelectorAll('.head-to-head-lifts li')).toHaveLength(7);
  expect(host.querySelector('.show-more-button')).toBeNull();
});

it('shows no head to head without shared lifts, while inactive or when it cannot load', async () => {
  const lifts = vi.spyOn(api.sharing, 'lifts').mockResolvedValue({ lifts: [] });
  await render(<HeadToHeadCard member={sam} active />);
  expect(host.innerHTML).toBe('');

  lifts.mockClear();
  await render(<HeadToHeadCard key="inactive" member={sam} active={false} />);
  expect(lifts).not.toHaveBeenCalled();

  lifts.mockRejectedValue(new Error('offline'));
  await render(<HeadToHeadCard key="failed" member={sam} active />);
  expect(host.innerHTML).toBe('');
});

it('ranks you among friends and opens a friend’s profile', async () => {
  vi.spyOn(api.sharing, 'liftLeaderboard').mockResolvedValue({
    entries: [ranking('sam', 'Sam', 121), ranking('me', 'Owner', 116.7)],
  });
  const onOpenMember = vi.fn();
  await render(<LiftLeaderboardCard exerciseId="bench" onOpenMember={onOpenMember} />);

  expect(api.sharing.liftLeaderboard).toHaveBeenCalledWith('bench');
  expect(text('.lift-leaderboard-name strong')).toEqual(['Sam', 'You']);
  expect(text('.lift-leaderboard li > * > b')).toEqual(['121 kg', '116.7 kg']);
  expect(text('.lift-leaderboard-name small')).toEqual(['100 kg × 5', '100 kg × 5']);
  // Only friends open a profile; your own row is not a button.
  const rows = [...host.querySelectorAll('.lift-leaderboard li')];
  expect(rows.map((row) => row.className)).toEqual(['', 'is-you']);
  expect(rows[1].querySelector('button')).toBeNull();
  await act(async () => rows[0].querySelector('button')?.click());
  expect(onOpenMember).toHaveBeenCalledWith(expect.objectContaining({ id: 'sam' }));
});

it('drops the previous lift’s ranking while another lift loads, and hides when empty', async () => {
  let answer: (value: { entries: LiftRanking[] }) => void = () => undefined;
  const board = vi
    .spyOn(api.sharing, 'liftLeaderboard')
    .mockResolvedValueOnce({ entries: [ranking('sam', 'Sam', 121)] })
    .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
  await render(<LiftLeaderboardCard exerciseId="bench" />);
  expect(text('.lift-leaderboard-name strong')).toEqual(['Sam']);

  await render(<LiftLeaderboardCard exerciseId="squat" />);
  expect(host.innerHTML).toBe('');
  await act(async () => answer({ entries: [] }));
  expect(host.innerHTML).toBe('');

  board.mockRejectedValueOnce(new Error('sharing_required'));
  await render(<LiftLeaderboardCard exerciseId="row" />);
  expect(host.innerHTML).toBe('');
});
