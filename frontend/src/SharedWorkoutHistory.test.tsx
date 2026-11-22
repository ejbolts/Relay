// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SharedWorkoutHistory } from './App';
import type { SharedWorkoutListProps } from './SharedProfiles';
import type { TrackedWorkout } from './types';

// One workout a week, newest first: two weeks make a page.
const dates = ['2026-10-14', '2026-10-07', '2026-09-30', '2026-09-23', '2026-09-16', '2026-09-09'];
const workouts: TrackedWorkout[] = dates.map((date) => ({
  id: `workout-${date}`,
  name: `Workout ${date}`,
  workout_date: date,
  category: 'lower',
  notes: null,
  duration_minutes: null,
  start_time: null,
  end_time: null,
  is_sample: false,
  created_at: `${date}T12:00:00Z`,
  updated_at: `${date}T12:00:00Z`,
  movements: [],
}));

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = (props: Partial<SharedWorkoutListProps>) =>
  act(async () =>
    root.render(
      <SharedWorkoutHistory
        workouts={workouts}
        personalRecords={[]}
        categoryColors={{} as never}
        weekStartDay={1}
        {...props}
      />,
    ),
  );
const button = (label: string) =>
  host.querySelector<HTMLButtonElement>(`nav button[aria-label="${label}"]`)!;
const slots = () =>
  [...host.querySelectorAll('.pagination-pages > *')].map(
    (item) => `${item.textContent}${item.getAttribute('aria-current') ? '*' : ''}`,
  );
const titles = () =>
  [...host.querySelectorAll('.history-week-header h2')].map((item) => item.textContent);

it('pages the weeks read so far, with a gap and Next while older workouts remain', async () => {
  const onLoadMore = vi.fn();
  await render({ workouts: workouts.slice(0, 5), hasMore: true, onLoadMore });
  expect(host.querySelector('nav')?.getAttribute('aria-label')).toBe('Workout pages');
  expect(slots()).toEqual(['1*', '2', '3', '…']);
  expect(host.querySelector('.pagination-status')?.textContent).toBe('Page 1');
  expect(button('Previous workout page').disabled).toBe(true);
  expect(button('Next workout page').disabled).toBe(false);
  expect(titles()).toHaveLength(2);
  expect(onLoadMore).not.toHaveBeenCalled();

  // The third page's second week may continue in workouts not read yet, so it reads more and
  // ignores taps meanwhile, without disabling the buttons.
  await act(async () => button('Page 3').click());
  expect(onLoadMore).toHaveBeenCalledOnce();
  expect(host.querySelector('nav')?.getAttribute('aria-busy')).toBe('true');
  expect(button('Next workout page').disabled).toBe(false);
  await act(async () => button('Next workout page').click());
  expect(slots()).toEqual(['1', '2', '3*', '…']);

  // Everything has loaded: the total is known and the gap goes.
  await render({ hasMore: false, onLoadMore });
  expect(slots()).toEqual(['1', '2', '3*']);
  expect(host.querySelector('.pagination-status')?.textContent).toBe('Page 3 of 3');
  expect(host.querySelector('nav')?.hasAttribute('aria-busy')).toBe(false);
  expect(button('Next workout page').disabled).toBe(true);
  expect(titles()).toHaveLength(2);
});

it('stops at the last loaded page when reading older workouts failed', async () => {
  await render({ workouts: workouts.slice(0, 5), hasMore: true, loadMoreFailed: true });
  await act(async () => button('Page 3').click());
  expect(host.querySelector('nav')?.hasAttribute('aria-busy')).toBe(false);
  expect(button('Next workout page').disabled).toBe(true);
  expect(button('Previous workout page').disabled).toBe(false);
});

it('hides the pager when every workout fits on one page', async () => {
  await render({ workouts: workouts.slice(0, 2) });
  expect(host.querySelector('nav')).toBeNull();
});

it("draws each workout in the member's own type colours, as their calendar does", async () => {
  const stripes = () =>
    [...host.querySelectorAll<HTMLElement>('.history-card-summary > i')].map(
      (item) => item.style.background,
    );
  const custom = {
    id: 'legs',
    name: 'Legs',
    color: '#123456',
    is_custom: true,
    archived: false,
  };
  const memberWorkouts: TrackedWorkout[] = [
    { ...workouts[0], category: 'lower' },
    { ...workouts[1], category: 'pull', workout_type_id: 'legs', workout_type: custom },
  ];
  const viewerColors = { lower: '#f59e0b', pull: '#3b82f6' } as never;

  await render({
    workouts: memberWorkouts,
    categoryColors: viewerColors,
    workoutTypes: [
      { id: 'lower', name: 'Lower body', color: '#eab308', is_custom: false, archived: false },
      custom,
    ],
  } as never);
  expect(stripes()).toEqual(['rgb(234, 179, 8)', 'rgb(18, 52, 86)']);

  // Without the member's types, the viewer's colours remain.
  await render({ workouts: memberWorkouts, categoryColors: viewerColors } as never);
  expect(stripes()).toEqual(['rgb(245, 158, 11)', 'rgb(18, 52, 86)']);
});
