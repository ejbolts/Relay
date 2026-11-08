// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WeeklyReviewCard } from './WeeklyReviewCard';
import { reviewCardioWeek, reviewRecord, reviewSet, reviewWorkout } from './weeklyReviewFixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

const week = (start: string, end: string, muscle_groups: Array<[string, number]>) => ({
  week_start: start,
  week_end: end,
  muscle_groups: muscle_groups.map(([muscle_group, raw_sets]) => ({
    muscle_group,
    raw_sets,
    contributions: [],
  })),
});

function props(overrides: Partial<Parameters<typeof WeeklyReviewCard>[0]> = {}) {
  return {
    workouts: [
      reviewWorkout('this', '2026-11-03', [reviewSet(100, 5), reviewSet(100, 5)]),
      reviewWorkout('last', '2026-10-28', [reviewSet(90, 5)]),
    ],
    records: [reviewRecord('pr', '2026-11-04', { value: 105, weight_kg: 105 })],
    measurements: [
      {
        id: 'm1',
        measurement_date: '2026-11-05',
        weight_kg: 80,
        body_fat_pct: null,
        notes: null,
        is_sample: false,
        created_at: '2026-11-05T08:00:00Z',
      },
      {
        id: 'm0',
        measurement_date: '2026-10-29',
        weight_kg: 81,
        body_fat_pct: null,
        notes: null,
        is_sample: false,
        created_at: '2026-10-29T08:00:00Z',
      },
    ],
    muscleWeeks: [
      week('2026-11-02', '2026-11-08', [
        ['Chest', 12],
        ['Back', 4],
      ]),
      week('2026-10-26', '2026-11-01', [['Chest', 6]]),
    ],
    muscleGoal: 10,
    cardioWeeks: [
      reviewCardioWeek('2026-11-02', 95, { 2: [95, 150] }),
      reviewCardioWeek('2026-10-26', 75, { 2: [75, 150] }),
    ],
    weightUnit: 'kg' as const,
    today: '2026-11-08',
    weekStartDay: 1,
    onOpenProgress: vi.fn(),
    onOpenCardio: vi.fn(),
    onOpenBody: vi.fn(),
    ...overrides,
  };
}

async function render(overrides: Partial<Parameters<typeof WeeklyReviewCard>[0]> = {}) {
  const value = props(overrides);
  await act(async () => root.render(<WeeklyReviewCard {...value} />));
  return value;
}

const text = () => host.textContent ?? '';
const button = (label: string) =>
  [...host.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === label || item.textContent === label,
  ) as HTMLButtonElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it('summarises the week against the week before', async () => {
  await render();
  expect(host.querySelector('h2')?.textContent).toBe('Weekly review');
  expect(text()).toContain('2 Nov – 8 Nov');
  expect(text()).not.toContain('so far');
  const stats = host.querySelector('.weekly-review-stats')!.textContent!;
  expect(stats).toContain('Workouts1±0');
  expect(stats).toContain('Sets2+1');
  expect(text()).toContain('Bench Press');
  expect(text()).toContain('1 at goal');
  expect(text()).toContain('Zone 295 / 150 min+20');
  expect(text()).toContain('80.0 kg');
  expect(host.querySelector('[aria-label="down 1.0 kg on the week before"]')).not.toBeNull();
});

it('marks the running week as so far and stepping back shows the earlier week', async () => {
  await render({ today: '2026-11-05' });
  expect(text()).toContain('so far');
  expect(button('Next week').disabled).toBe(true);
  await act(async () => button('Previous week').click());
  expect(text()).toContain('Last week');
  expect(text()).toContain('26 Oct – 1 Nov');
  expect(text()).not.toContain('so far');
  expect(button('Next week').disabled).toBe(false);
  await act(async () => button('Next week').click());
  expect(text()).toContain('This week');
});

it('opens the exercise behind a record and the cardio and body screens', async () => {
  const value = await render();
  const record = host.querySelector('.weekly-review-records button') as HTMLButtonElement;
  await act(async () => record.click());
  expect(value.onOpenProgress).toHaveBeenCalledWith('bench');
  await act(async () => button('Cardio').click());
  expect(value.onOpenCardio).toHaveBeenCalled();
  await act(async () => button('Body').click());
  expect(value.onOpenBody).toHaveBeenCalled();
});

it('says so when nothing was logged', async () => {
  await render({
    workouts: [],
    records: [],
    measurements: [],
    cardioWeeks: [reviewCardioWeek('2026-11-02', 0, { 2: [0, 150] })],
  });
  expect(text()).toContain('Nothing logged yet this week.');
  expect(text()).toContain('No new strength records.');
  expect(text()).toContain('Zone 20 / 150 min');
  expect(text()).toContain('No check-ins logged.');
});

it('counts pure cardio minutes as something logged', async () => {
  await render({
    workouts: [],
    records: [],
    measurements: [],
    cardioWeeks: [reviewCardioWeek('2026-11-02', 40, {})],
  });
  expect(text()).not.toContain('Nothing logged');
  expect(text()).toContain('40 min');
  expect(text()).toContain('No zone goals set.');
});

it('still renders the rest of the review for a dashboard cached without cardio weeks', async () => {
  await render({ cardioWeeks: [] });
  expect(text()).toContain('No cardio data.');
  expect(text()).toContain('Bench Press');
});
