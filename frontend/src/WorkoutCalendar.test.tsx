// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WeekStrip, WorkoutCalendar } from './WorkoutCalendar';
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
  expect(trained.style.getPropertyValue('--day-fill')).toBe('#8b5cf6');
  expect(trained.style.getPropertyValue('--day-ink')).toBe('#000000');
  expect(trained.querySelector('.calendar-day-dots')).toBeNull();
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
            { date: '2026-12-30', label: 'Full body A', color: '#14b8a6' },
            { date: '2026-12-31', label: 'Rest', color: '#828b92' },
            { date: '2027-01-01', label: 'Not started' },
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
  expect(host.querySelector('.calendar-day-label')).toBeNull();
  expect(host.querySelector('[data-date="2026-12-31"]')?.getAttribute('aria-label')).toContain(
    'Rest',
  );
  expect(host.querySelector('[data-date="2027-01-01"] .calendar-day-dots i')).toBeNull();
});

const day = (workout_date: string, categories: HeatmapDay['categories']): HeatmapDay => ({
  ...entry,
  workout_date,
  categories,
});
const cell = (date: string) => host.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!;

it('fills each trained day with its workout colours and joins back-to-back days', async () => {
  const entries = [
    day('2026-10-19', ['upper']),
    day('2026-10-20', ['lower']),
    day('2026-10-21', ['upper', 'cardio']),
    day('2026-10-23', ['pull']),
  ];
  const render = (hidden: string[]) =>
    act(async () =>
      root.render(
        <WorkoutCalendar
          entries={entries}
          categoryColors={colors}
          hiddenCategories={new Set(hidden)}
          onDayClick={vi.fn()}
        />,
      ),
    );
  await render([]);
  const chain = (date: string) =>
    ['chain-prev', 'chain-next'].filter((name) => cell(date).classList.contains(name));
  expect(chain('2026-10-19')).toEqual(['chain-next']);
  expect(chain('2026-10-20')).toEqual(['chain-prev', 'chain-next']);
  expect(chain('2026-10-21')).toEqual(['chain-prev']);
  expect(chain('2026-10-23')).toEqual([]);
  expect(chain('2026-10-22')).toEqual([]);
  expect(cell('2026-10-21').style.getPropertyValue('--day-fill')).toBe(
    'linear-gradient(135deg, #8b5cf6 0% 50%, #22c55e 50% 100%)',
  );

  // Switching a type off in the legend drops its colour; a day left with none goes neutral.
  await render(['upper']);
  expect(cell('2026-10-21').style.getPropertyValue('--day-fill')).toBe('#22c55e');
  expect(cell('2026-10-21').classList.contains('filtered-out')).toBe(false);
  expect(cell('2026-10-19').classList.contains('filtered-out')).toBe(true);
  expect(cell('2026-10-19').style.getPropertyValue('--day-fill')).toBe('');
  expect(chain('2026-10-19')).toEqual(['chain-next']);
});

it('keeps an in-progress day out of the fill and the streak band', async () => {
  await act(async () =>
    root.render(
      <WorkoutCalendar
        entries={[day('2026-10-25', ['upper']), day('2026-10-26', ['lower'])]}
        categoryColors={colors}
        activeWorkoutDate="2026-10-26"
        onDayClick={vi.fn()}
      />,
    ),
  );
  expect(cell('2026-10-25').className).not.toContain('chain-');
  expect(cell('2026-10-26').className).not.toContain('chain-');
  expect(cell('2026-10-26').style.getPropertyValue('--day-fill')).toBe('');
  expect(cell('2026-10-26').querySelector('.calendar-live-dot')).not.toBeNull();
});

it('leads Home with this week, naming each day’s workout type', async () => {
  const select = vi.fn();
  const resume = vi.fn();
  const entries = [
    day('2026-10-25', ['full_body']),
    day('2026-10-26', ['upper', 'cardio']),
    day('2026-10-27', ['lower']),
  ];
  const render = (weekStartDay: number, hidden: string[] = [], active: string | null = null) =>
    act(async () =>
      root.render(
        <WeekStrip
          entries={entries}
          categoryColors={colors}
          hiddenCategories={new Set(hidden)}
          weekStartDay={weekStartDay}
          activeWorkoutDate={active}
          onActiveWorkoutClick={resume}
          onDayClick={select}
        />,
      ),
    );
  const dates = () =>
    [...host.querySelectorAll<HTMLElement>('.week-strip-day')].map((el) => el.dataset.date);
  const label = (date: string) => cell(date).querySelector('.week-strip-type')!.textContent;

  // Today is Monday 26 October; a Monday week starts on it and a Sunday week the day before.
  await render(1);
  expect(dates()).toEqual([
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
  ]);
  expect(cell('2026-10-26').getAttribute('aria-current')).toBe('date');
  expect(label('2026-10-26')).toBe('Upper +1');
  expect(cell('2026-10-26').classList.contains('mixed')).toBe(true);
  expect(cell('2026-10-26').style.getPropertyValue('--day-color-2')).toBe('#22c55e');
  expect(label('2026-10-27')).toBe('Lower');
  expect(cell('2026-10-27').style.getPropertyValue('--day-color')).toBe('#f59e0b');
  expect(label('2026-10-28')).toBe('');
  expect(cell('2026-10-28').classList.contains('future')).toBe(true);

  await act(async () => cell('2026-10-27').click());
  expect(select).toHaveBeenLastCalledWith('2026-10-27', entries[2]);
  await act(async () => cell('2026-10-28').click());
  expect(select).toHaveBeenLastCalledWith('2026-10-28', undefined);

  await render(0, ['upper']);
  expect(dates()[0]).toBe('2026-10-25');
  expect(label('2026-10-25')).toBe('Full');
  expect(label('2026-10-26')).toBe('Cardio');
  expect(cell('2026-10-26').classList.contains('mixed')).toBe(false);

  // A day with every type switched off keeps its name and loses its colour.
  await render(1, ['lower']);
  expect(label('2026-10-27')).toBe('Lower');
  expect(cell('2026-10-27').style.getPropertyValue('--day-color')).toBe('');

  select.mockClear();
  await render(1, [], '2026-10-26');
  expect(cell('2026-10-26').getAttribute('aria-label')).toContain('Resume workout in progress');
  await act(async () => cell('2026-10-26').click());
  expect(resume).toHaveBeenCalledOnce();
  expect(select).not.toHaveBeenCalled();
});
