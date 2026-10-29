// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkoutCalendar } from './WorkoutCalendar';
import { builtinTypeColors, DEFAULT_WORKOUT_TYPES } from './workoutTypes';
import type { HeatmapDay } from './types';

let root: Root;
let host: HTMLDivElement;
const colors = builtinTypeColors(DEFAULT_WORKOUT_TYPES);
const entry: HeatmapDay = {
  workout_date: '2026-08-11',
  categories: ['upper'],
  workout_count: 1,
  set_count: 3,
  workouts: [],
};
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T12:00:00'));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('preserves history month order, workout colours and date selection without preview data', async () => {
  const select = vi.fn();
  await act(async () =>
    root.render(<WorkoutCalendar entries={[entry]} categoryColors={colors} onDayClick={select} />),
  );
  expect([...host.querySelectorAll('.calendar-month h3')].map((el) => el.textContent)).toEqual([
    'August 2026',
    'September 2026',
    'October 2026',
  ]);
  const trained = host.querySelector<HTMLButtonElement>('[data-date="2026-08-11"]')!;
  expect(trained.classList.contains('trained')).toBe(true);
  expect(trained.getAttribute('aria-label')).toContain('View 1 workout');
  expect(trained.querySelector<HTMLElement>('.calendar-day-dots i')?.style.backgroundColor).toBe(
    'rgb(139, 92, 246)',
  );
  await act(async () => trained.click());
  expect(select).toHaveBeenLastCalledWith('2026-08-11', entry);
  const empty = host.querySelector<HTMLButtonElement>('[data-date="2026-10-26"]')!;
  expect(empty.disabled).toBe(false);
  await act(async () => empty.click());
  expect(select).toHaveBeenLastCalledWith('2026-10-26', undefined);
});

it('retains shared-profile read-only dates and active-workout resume behavior', async () => {
  const resume = vi.fn();
  const select = vi.fn();
  await act(async () =>
    root.render(
      <WorkoutCalendar
        entries={[entry]}
        categoryColors={colors}
        onDayClick={select}
        readOnly
        activeWorkoutDate="2026-10-26"
        onActiveWorkoutClick={resume}
      />,
    ),
  );
  expect(host.querySelector<HTMLButtonElement>('[data-date="2026-10-25"]')!.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('[data-date="2026-08-11"]')!.disabled).toBe(false);
  // History's in-progress interaction remains unchanged when creation is available.
  await act(async () =>
    root.render(
      <WorkoutCalendar
        entries={[entry]}
        categoryColors={colors}
        onDayClick={select}
        activeWorkoutDate="2026-10-26"
        onActiveWorkoutClick={resume}
      />,
    ),
  );
  await act(async () => host.querySelector<HTMLButtonElement>('[data-date="2026-10-26"]')!.click());
  expect(resume).toHaveBeenCalledOnce();
  expect(select).not.toHaveBeenCalled();
});

it('renders two future schedule months as planned dates, without workout creation or completion styling', async () => {
  await act(async () =>
    root.render(
      <WorkoutCalendar
        preview={{
          from: '2026-12-01',
          days: [
            { date: '2026-12-30', label: 'Full body A', shortLabel: 'Full A', color: '#14b8a6' },
            { date: '2026-12-31', label: 'Rest', color: '#828b92' },
            { date: '2027-01-01', label: 'Not started', shortLabel: '—' },
          ],
        }}
      />,
    ),
  );
  expect([...host.querySelectorAll('.calendar-month h3')].map((el) => el.textContent)).toEqual([
    'December 2026',
    'January 2027',
  ]);
  expect(host.querySelectorAll('.calendar-day.trained')).toHaveLength(0);
  expect(host.querySelector('[aria-label^="Create workout"]')).toBeNull();
  expect(host.querySelectorAll('.calendar-day:not(.empty):not(:disabled)')).toHaveLength(0);
  expect(host.querySelector('[data-date="2026-12-30"]')?.getAttribute('aria-label')).toContain(
    'Full body A',
  );
  expect(host.querySelector('[data-date="2026-12-30"] .calendar-day-label')?.textContent).toBe(
    'Full A',
  );
  expect(host.querySelector('[data-date="2026-12-31"]')?.textContent).toContain('Rest');
  expect(host.querySelector('[data-date="2027-01-01"] .calendar-day-dots i')).toBeNull();
});
