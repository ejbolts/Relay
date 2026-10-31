// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExerciseMuscleHelp } from './ExerciseMuscleHelp';
import { ExerciseCreditsContext } from './exerciseCreditsContext';
import { partialSetsEnabledForWeek } from './exercisePartialSets';
import type { Exercise } from './types';

const exercise: Exercise = {
  id: 'press',
  name: 'Leg Press',
  kind: 'strength',
  category: 'lower',
  muscle_group: 'Quads',
  is_custom: false,
  is_favorite: false,
  equipment: 'Machine',
  muscle_contributions: [],
  partial_sets_default: true,
  partial_sets_enabled: false,
  partial_set_weeks: [
    { week_start: '2026-10-05', enabled: false },
    { week_start: '2026-10-12', enabled: true },
    { week_start: '2026-10-19', enabled: false },
  ],
  default_muscle_set_credits: [
    { muscle_name: 'Quadriceps', sets: 1 },
    { muscle_name: 'Adductors', sets: 0.5 },
  ],
};
let root: Root, host: HTMLDivElement;
const click = async (element: Element) => act(async () => (element as HTMLElement).click());
const named = (name: string) =>
  document.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T12:00:00'));
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('carries weekly choices without applying future changes to earlier weeks', () => {
  expect(partialSetsEnabledForWeek(exercise, '2026-09-28')).toBe(true);
  expect(partialSetsEnabledForWeek(exercise, '2026-10-05')).toBe(false);
  expect(partialSetsEnabledForWeek(exercise, '2026-10-12')).toBe(true);
  expect(partialSetsEnabledForWeek(exercise, '2026-10-19')).toBe(false);
  expect(partialSetsEnabledForWeek(exercise, '2026-10-26')).toBe(false);
  expect(exercise.partial_set_weeks!.map((item) => item.week_start)).toEqual([
    '2026-10-05',
    '2026-10-12',
    '2026-10-19',
  ]);
});

it('opens the new week when the page was left open across a weekly rollover', async () => {
  vi.setSystemTime(new Date('2026-10-25T23:59:00'));
  await act(async () =>
    root.render(
      <ExerciseCreditsContext.Provider
        value={{ exercises: [exercise], updatePartialSets: vi.fn() }}
      >
        <ExerciseMuscleHelp exercise={exercise} />
      </ExerciseCreditsContext.Provider>,
    ),
  );
  vi.setSystemTime(new Date('2026-10-26T00:01:00'));
  await click(named('Muscle set credits for Leg Press'));
  expect(document.querySelector<HTMLInputElement>('[aria-label="Partial-set week"]')!.value).toBe(
    '2026-10-26',
  );
});

it('opens this week, browses prior settings and saves only the selected week while later choices survive', async () => {
  const save = vi.fn();
  function Harness() {
    const [current, setCurrent] = useState(exercise);
    return (
      <ExerciseCreditsContext.Provider
        value={{
          exercises: [current],
          updatePartialSets: async (id, enabled, weekStart) => {
            save(id, enabled, weekStart);
            const next = {
              ...current,
              partial_set_weeks: [
                ...current.partial_set_weeks!.filter((item) => item.week_start !== weekStart),
                { week_start: weekStart, enabled },
              ],
            };
            next.partial_sets_enabled = partialSetsEnabledForWeek(next, '2026-10-26');
            setCurrent(next);
            return next;
          },
        }}
      >
        <ExerciseMuscleHelp exercise={current} />
      </ExerciseCreditsContext.Provider>
    );
  }
  await act(async () => root.render(<Harness />));
  await click(named('Muscle set credits for Leg Press'));
  const week = () => document.querySelector<HTMLInputElement>('[aria-label="Partial-set week"]')!;
  const toggle = () => document.querySelector<HTMLInputElement>('[role="switch"]')!;
  expect(week().value).toBe('2026-10-26');
  expect(toggle().checked).toBe(false);
  expect(named('Next partial-set week').disabled).toBe(true);
  await click(named('Previous partial-set week'));
  expect(toggle().checked).toBe(false);
  await click(named('Previous partial-set week'));
  expect(week().value).toBe('2026-10-12');
  expect(toggle().checked).toBe(true);
  await click(named('Previous partial-set week'));
  expect(week().value).toBe('2026-10-05');
  expect(toggle().checked).toBe(false);
  await click(toggle());
  expect(save).toHaveBeenCalledExactlyOnceWith('press', true, '2026-10-05');
  expect(toggle().checked).toBe(true);
  await click(named('Next partial-set week'));
  await click(named('Next partial-set week'));
  expect(toggle().checked).toBe(false);
  expect(document.querySelector('dialog')?.textContent).toContain(
    'Earlier weeks keep their settings',
  );
});
