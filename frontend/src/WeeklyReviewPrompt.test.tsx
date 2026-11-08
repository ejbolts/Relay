// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DashboardData } from './types';
import { WeeklyReviewPrompt } from './WeeklyReviewPrompt';
import { markWeeklyReviewShown, weeklyReviewShownFor } from './weeklyReviewPromptState';
import { reviewCardioWeek, reviewRecord, reviewSet, reviewWorkout } from './weeklyReviewFixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let account = 0;

// Monday 9 Nov 2026 opens a new week; the review covers 2–8 Nov, against 26 Oct – 1 Nov.
const muscleWeek = (start: string, end: string, sets: number) => ({
  week_start: start,
  week_end: end,
  muscle_groups: [{ muscle_group: 'Chest', raw_sets: sets, contributions: [] }],
});

function dashboard(weekStart = '2026-11-09'): DashboardData {
  return {
    weekly_sets: muscleWeek(weekStart, weekStart, 0),
    cardio_weeks: [
      reviewCardioWeek('2026-11-09', 0, {}),
      reviewCardioWeek('2026-11-02', 40, { 2: [40, 150] }),
    ],
  } as unknown as DashboardData;
}

function props(overrides: Partial<Parameters<typeof WeeklyReviewPrompt>[0]> = {}) {
  return {
    userId: `user-${account}`,
    enabled: true,
    dashboard: dashboard(),
    muscleWeeks: [
      muscleWeek('2026-11-09', '2026-11-15', 0),
      muscleWeek('2026-11-02', '2026-11-08', 12),
      muscleWeek('2026-10-26', '2026-11-01', 6),
    ],
    workouts: [
      reviewWorkout('last', '2026-11-03', [reviewSet(100, 5), reviewSet(100, 5)]),
      reviewWorkout('before', '2026-10-28', [reviewSet(90, 5)]),
    ],
    records: [reviewRecord('pr', '2026-11-04', { value: 105, weight_kg: 105 })],
    measurements: [],
    today: '2026-11-09',
    onOpenProgress: vi.fn(),
    onOpenCardio: vi.fn(),
    onOpenBody: vi.fn(),
    ...overrides,
  };
}

async function render(overrides: Partial<Parameters<typeof WeeklyReviewPrompt>[0]> = {}) {
  const value = props(overrides);
  await act(async () => root.render(<WeeklyReviewPrompt {...value} />));
  return value;
}

const popup = () => document.body.querySelector('dialog.weekly-review-popup');
const button = (label: string) =>
  [...document.body.querySelectorAll('button')].find(
    (item) => item.textContent === label,
  ) as HTMLButtonElement;

beforeEach(() => {
  account += 1;
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  window.localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it('opens last week once at the start of a new week and remembers that it did', async () => {
  const value = await render();
  expect(popup()?.textContent).toContain('Last week');
  expect(popup()?.textContent).toContain('2 Nov – 8 Nov');
  expect(popup()?.textContent).not.toContain('so far');
  expect(popup()?.textContent).toContain('Workouts1±0');
  expect(popup()?.textContent).toContain('Zone 240 / 150 min');
  expect(weeklyReviewShownFor(value.userId)).toBe('2026-11-09');

  await act(async () => button('Got it').click());
  expect(popup()).toBeNull();
  await act(async () => root.render(<WeeklyReviewPrompt {...value} />));
  expect(popup()).toBeNull();
});

it('does not open again in a later session of the same week', async () => {
  markWeeklyReviewShown(`user-${account}`, '2026-11-09');
  await render();
  expect(popup()).toBeNull();
});

it('waits while another dialog or onboarding step has the screen', async () => {
  const value = await render({ enabled: false });
  expect(popup()).toBeNull();
  expect(weeklyReviewShownFor(value.userId)).toBeNull();
  await act(async () => root.render(<WeeklyReviewPrompt {...value} enabled />));
  expect(popup()).not.toBeNull();
});

it('waits for a dashboard from the current week rather than reviewing a cached one', async () => {
  const value = await render({ dashboard: dashboard('2026-11-02') });
  expect(popup()).toBeNull();
  await act(async () => root.render(<WeeklyReviewPrompt {...value} dashboard={dashboard()} />));
  expect(popup()).not.toBeNull();
});

it('stays quiet when last week had nothing logged, or only sample workouts', async () => {
  await render({ workouts: [], records: [] });
  expect(popup()).toBeNull();
  await render({
    workouts: [reviewWorkout('sample', '2026-11-03', [reviewSet(100, 5)], { is_sample: true })],
  });
  expect(popup()).toBeNull();
});

it('closes before opening the exercise behind a record', async () => {
  const value = await render();
  await act(async () =>
    (document.body.querySelector('.weekly-review-records button') as HTMLButtonElement).click(),
  );
  expect(value.onOpenProgress).toHaveBeenCalledWith('bench');
  expect(popup()).toBeNull();
});
