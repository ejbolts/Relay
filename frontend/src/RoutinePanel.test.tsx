// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { ExerciseCreditsContext } from './exerciseCreditsContext';
import { RoutinePanel } from './RoutinePanel';
import type { Exercise, Routine } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';

const bench: Exercise = {
  id: 'bench',
  name: 'Bench press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const row: Exercise = { ...bench, id: 'row', name: 'Cable row', category: 'pull' };
const original: Routine = {
  id: 'source',
  name: 'Upper / Rest',
  shared: true,
  days: [
    {
      workout_type_id: 'upper',
      workout_type: DEFAULT_WORKOUT_TYPES[0],
      movements: [
        {
          exercise_id: bench.id,
          exercise: bench,
          sets: [
            {
              reps: 8,
              weight_kg: 50,
              duration_seconds: null,
              distance_km: null,
              rest_seconds: 120,
              set_type: 'normal',
            },
          ],
        },
      ],
    },
    { workout_type_id: null, workout_type: null, movements: [] },
  ],
};
let root: Root;
let host: HTMLDivElement;
async function mount(own = false, onOpenSplits?: (id?: string) => void) {
  await act(async () =>
    root.render(<RoutinePanel ownerId="friend" own={own} onOpenSplits={onOpenSplits} />),
  );
}
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (x) => x.textContent === text || x.getAttribute('aria-label') === text,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
async function input(selector: string, value: string) {
  await act(async () => {
    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      'value',
    )!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function addExercise(day: number, query: string, name: string) {
  await click(`Add exercise to day ${day}`);
  await input(`[aria-label="Search exercises to add to day ${day}"]`, query);
  const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (x) => x.querySelector('strong')?.textContent === name,
  );
  expect(option).toBeDefined();
  await act(async () => option!.click());
}
async function openDay(day: number) {
  await act(async () =>
    document.querySelectorAll<HTMLButtonElement>('.routine-day-toggle')[day - 1].click(),
  );
}
async function save() {
  await act(async () =>
    document
      .querySelector('.routine-editor')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.spyOn(api.routines, 'profile').mockResolvedValue([structuredClone(original)]);
  vi.spyOn(api.routines, 'list').mockResolvedValue([structuredClone(original)]);
  vi.spyOn(api.routines, 'copy').mockResolvedValue({
    ...structuredClone(original),
    id: 'copy',
    shared: false,
  });
  vi.spyOn(api.routines, 'save').mockImplementation(async (routine) => routine);
  vi.spyOn(api.routines, 'create').mockImplementation(async (routine) => ({
    ...routine,
    id: 'new',
  }));
  vi.spyOn(api.routines, 'use').mockResolvedValue({
    name: original.name,
    enabled: true,
    start_date: '2026-10-29',
    steps: [],
  });
  vi.spyOn(api, 'listExercises').mockResolvedValue([bench, row]);
  vi.spyOn(api, 'getCardioPreferences').mockResolvedValue({
    heart_rate_zones: [],
    goals: [{ zone: 2, minutes: 150 }],
  });
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

it('copies into an editable private routine and adapts exercise and weight independently', async () => {
  await mount();
  await click('Save split');
  expect(api.routines.copy).toHaveBeenCalledWith('friend', 'source');
  expect(document.querySelector('[role="switch"]')).toBeNull();
  expect(document.querySelector('.routine-editor')?.textContent).not.toContain(
    'Show on my profile',
  );
  await input('[aria-label="Day 1 exercise 1"]', 'row');
  await click('One more set of Cable row on day 1');
  await save();
  expect(api.routines.save).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'copy', shared: false }),
  );
  const saved = vi.mocked(api.routines.save).mock.calls[0][0];
  expect(saved.days[0].movements[0]).toMatchObject({
    exercise_id: 'row',
    sets: [{ weight_kg: 50 }, { weight_kg: 50, set_type: 'normal' }],
  });
  expect(original.days[0].movements[0].sets).toHaveLength(1);
  expect(api.routines.use).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('opens My splits at the imported copy after dismissing the editor', async () => {
  const open = vi.fn();
  await mount(false, open);
  expect(host.textContent).not.toContain('View my splits');
  await click('Save split');
  await click('Close Edit split');
  await click('View my splits');
  expect(open).toHaveBeenCalledWith('copy');
  expect(api.routines.use).not.toHaveBeenCalled();
});

it('keeps edits after a failed save and allows retry', async () => {
  await mount(true);
  await click('Edit split');
  await click('One more set of Bench press on day 1');
  vi.mocked(api.routines.save).mockRejectedValueOnce(new Error('Connection lost'));
  await save();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Connection lost');
  expect(document.querySelector('.routine-stepper output')?.textContent).toBe('2');
  await save();
  expect(api.routines.save).toHaveBeenCalledTimes(2);
});

it('shows save feedback in a dismissible popup that clears automatically after repeated saves', async () => {
  vi.useFakeTimers();
  try {
    await mount(true);
    await click('Edit split');
    await save();
    expect(document.querySelector('.app-notification-toast')?.textContent).toContain(
      'Split saved.',
    );
    expect(host.textContent).not.toContain('Split saved.');
    await click('Close notification');
    expect(document.querySelector('.app-notification-toast')).toBeNull();

    await click('Edit split');
    await save();
    await act(async () => vi.advanceTimersByTime(7000));
    expect(document.querySelector('.app-notification-toast')).not.toBeNull();
    await click('Edit split');
    await save();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(document.querySelector('.app-notification-toast')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(7000));
    expect(document.querySelector('.app-notification-toast')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it('requires an explicit date confirmation before replacing the active split', async () => {
  await mount(true);
  await click('Use split');
  expect(api.routines.use).not.toHaveBeenCalled();
  await input('input[type="date"]', '2026-11-02');
  await act(async () =>
    document
      .querySelector('.routine-use')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(api.routines.use).toHaveBeenCalledWith('source', '2026-11-02', 'workouts');
  expect(document.querySelector('.app-notification-toast')).toBeNull();
  expect(host.textContent).not.toContain('is your active split');
});

it('creates private splits without a publishing switch and shares from split options', async () => {
  await mount(true);
  await click('New split');
  await addExercise(1, 'bnch', 'Bench press');
  await click('Add rest day');
  expect(document.querySelector('.routine-editor [role="switch"]')).toBeNull();
  await save();
  expect(api.routines.create).toHaveBeenCalledWith(
    expect.objectContaining({
      shared: false,
      days: [
        expect.objectContaining({ movements: [expect.objectContaining({ exercise_id: 'bench' })] }),
        expect.objectContaining({ workout_type_id: null }),
      ],
    }),
  );
  expect(host.querySelectorAll('.routine-card')).toHaveLength(2);
  await click('Close notification');
  await click('Options for My split');
  await click('Show on my profile');
  expect(api.routines.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'new', shared: true }),
  );
  expect(host.querySelector('.routine-card-meta')?.textContent).toContain('On profile');
  await click('Close notification');
  await click('Options for My split');
  await click('Hide from my profile');
  expect(api.routines.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'new', shared: false }),
  );
});

it('retries failed profile loading and does not open an editor after failed copying', async () => {
  vi.mocked(api.routines.profile).mockRejectedValueOnce(new Error('Offline'));
  await mount();
  expect(host.textContent).toContain('Offline');
  await click('Try again');
  vi.mocked(api.routines.copy).mockRejectedValueOnce(new Error('Routine is no longer shared'));
  await click('Save split');
  expect(host.textContent).toContain('Routine is no longer shared');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('explains how to complete an empty workout day before sharing and allows retry after editing', async () => {
  const routine = structuredClone(original);
  routine.shared = false;
  routine.days.splice(1, 0, {
    workout_type_id: 'pull',
    workout_type: DEFAULT_WORKOUT_TYPES.find((type) => type.id === 'pull')!,
    movements: [],
  });
  vi.mocked(api.routines.list).mockResolvedValue([routine]);
  await mount(true);
  await click('Options for Upper / Rest');
  await click('Show on my profile');
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    'Add an exercise to each workout day in Edit split, then try again.',
  );
  expect(document.querySelector('dialog[open]')?.textContent).toContain('Split options');
  expect(host.querySelector('.routine-card-meta')?.textContent).toContain('Only you');
  expect(api.routines.save).not.toHaveBeenCalled();
  await click('Close Split options');
  await click('Edit split');
  await openDay(2);
  await addExercise(2, 'row', 'Cable row');
  await save();
  await click('Close notification');
  await click('Options for Upper / Rest');
  await click('Show on my profile');
  expect(api.routines.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: routine.id, shared: true }),
  );
  expect(host.querySelector('.routine-card-meta')?.textContent).toContain('On profile');
  expect(document.querySelector('[role="alert"]')).toBeNull();
});

it('keeps failed publishing in split options and preserves the saved privacy state', async () => {
  vi.mocked(api.routines.list).mockResolvedValue([{ ...structuredClone(original), shared: false }]);
  await mount(true);
  await click('Options for Upper / Rest');
  vi.mocked(api.routines.save).mockRejectedValueOnce(new Error('Could not save the split.'));
  await click('Show on my profile');
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Could not save the split.');
  expect(document.querySelector('dialog[open]')?.textContent).toContain('Split options');
  expect(host.querySelector('.routine-card-meta')?.textContent).toContain('Only you');
  expect(api.routines.save).toHaveBeenCalledOnce();
});

it('preserves an existing shared split when editing without a publishing control', async () => {
  await mount(true);
  await click('Edit split');
  expect(document.querySelector('.routine-editor [role="switch"]')).toBeNull();
  await save();
  expect(api.routines.save).toHaveBeenCalledWith(expect.objectContaining({ shared: true }));
});

it('steps cardio minutes as a planned target', async () => {
  const cardio: Exercise = {
    ...bench,
    id: 'run',
    name: 'Running',
    category: 'cardio',
    kind: 'cardio',
  };
  const routine = structuredClone(original);
  routine.days[0].movements = [
    {
      exercise_id: cardio.id,
      exercise: cardio,
      sets: [
        {
          ...routine.days[0].movements[0].sets[0],
          reps: null,
          weight_kg: null,
          duration_seconds: 600,
          distance_km: 2,
        },
      ],
    },
  ];
  vi.mocked(api.routines.list).mockResolvedValue([routine]);
  vi.mocked(api.listExercises).mockResolvedValue([bench, row, cardio]);
  await mount(true);
  await click('Edit split');
  expect(document.querySelector('.routine-stepper output')?.textContent).toBe('10 min');
  await click('5 more minutes of Running on day 1');
  await save();
  expect(vi.mocked(api.routines.save).mock.calls[0][0].days[0].movements[0].sets[0]).toMatchObject({
    duration_seconds: 900,
    distance_km: 2,
    weight_kg: null,
  });
});

const chartRows = () =>
  [...document.querySelectorAll('.split-volume-row')].map(
    (row) => row.querySelector('.sr-only')?.textContent,
  );
const count = () => document.querySelector('.split-volume-count')?.textContent;

it('charts planned weekly sets per muscle and updates them as sets change', async () => {
  await mount(true);
  await click('Edit split');
  // A two-day cycle repeats 3.5 times a week, so one bench set is 3.5 sets of chest.
  expect(chartRows()).toEqual([
    'Chest: 3.5 of 10 sets a week, under target',
    'Cardio: 0 of 150 minutes a week, under target',
  ]);
  expect(count()).toBe('0 of 2 on target');
  await click('One more set of Bench press on day 1');
  await click('One more set of Bench press on day 1');
  expect(document.querySelector('.routine-stepper output')?.textContent).toBe('3');
  expect(chartRows()[0]).toBe('Chest: 10.5 of 10 sets a week, on target');
  expect(count()).toBe('1 of 2 on target');
  expect(document.querySelector('.routine-day-toggle small')?.textContent).toBe(
    '1 exercise · 3 sets',
  );
  await click('One fewer set of Bench press on day 1');
  await click('One fewer set of Bench press on day 1');
  expect(chartRows()[0]).toBe('Chest: 3.5 of 10 sets a week, under target');
  await click('Remove Bench press from day 1');
  expect(chartRows()).toEqual(['Cardio: 0 of 150 minutes a week, under target']);
  expect(document.querySelector('.routine-day-toggle small')?.textContent).toBe('No exercises');
});

it('marks the days that train a selected muscle', async () => {
  const routine = structuredClone(original);
  routine.days[1] = {
    workout_type_id: 'lower',
    workout_type: DEFAULT_WORKOUT_TYPES[1],
    movements: [
      {
        exercise_id: 'squat',
        exercise: {
          ...bench,
          id: 'squat',
          name: 'Squat',
          category: 'lower',
          muscle_group: 'Quads',
        },
        sets: [routine.days[0].movements[0].sets[0], routine.days[0].movements[0].sets[0]],
      },
    ],
  };
  vi.mocked(api.routines.list).mockResolvedValue([routine]);
  await mount(true);
  await click('Edit split');
  const quads = [...document.querySelectorAll<HTMLButtonElement>('.split-volume-row')].find((row) =>
    row.textContent?.startsWith('Quads:'),
  )!;
  expect(quads.querySelector('.sr-only')?.textContent).toBe(
    'Quads: 7 of 10 sets a week, nearly there',
  );
  await act(async () => quads.click());
  expect(quads.getAttribute('aria-pressed')).toBe('true');
  const days = [...document.querySelectorAll('.routine-day')];
  expect(days[0].className).toContain('is-dim');
  expect(days[1].className).not.toContain('is-dim');
  expect(days[1].querySelector('.routine-day-hit')?.textContent).toBe('+2 sets');
  await act(async () => quads.click());
  expect(document.querySelector('.routine-day.is-dim')).toBeNull();
});

it("explains each exercise's set credits and charts partial-set changes made there", async () => {
  const credited: Exercise = {
    ...bench,
    muscle_set_credits: [
      { muscle_name: 'Chest', sets: 1 },
      { muscle_name: 'Triceps', sets: 0.5 },
    ],
  };
  const routine = structuredClone(original);
  routine.days[0].movements[0].exercise = credited;
  vi.mocked(api.routines.list).mockResolvedValue([routine]);
  const withLibrary = (exercise: Exercise) => (
    <ExerciseCreditsContext.Provider
      value={{ exercises: [exercise], updatePartialSets: async () => exercise }}
    >
      <RoutinePanel ownerId="friend" own />
    </ExerciseCreditsContext.Provider>
  );
  await act(async () => root.render(withLibrary(credited)));
  await click('Edit split');
  expect(document.querySelector('.routine-exercise-main small')?.textContent).toBe(
    'Chest · Triceps ½',
  );
  await click('Muscle set credits for Bench press');
  const credits = document.querySelector('.exercise-muscle-dialog')!;
  expect(credits.textContent).toContain('Direct work');
  expect(credits.textContent).toContain('Partial credit · assistance');
  await click('Close Bench press');
  expect(chartRows()).toContain('Triceps: 1.8 of 10 sets a week, under target');
  // Turning partial sets off in the popup updates the library copy of the exercise.
  await act(async () =>
    root.render(
      withLibrary({ ...credited, muscle_set_credits: [{ muscle_name: 'Chest', sets: 1 }] }),
    ),
  );
  expect(chartRows().some((row) => row?.startsWith('Triceps'))).toBe(false);
  expect(document.querySelector('.routine-exercise-main small')?.textContent).toBe('Chest');
});

it('keeps closed days mounted for their closing animation but out of reach', async () => {
  await mount(true);
  await click('Edit split');
  const inert = () =>
    [...document.querySelectorAll('.routine-day-panel')].map((panel) =>
      panel.hasAttribute('inert'),
    );
  expect(inert()).toEqual([false, true]);
  await openDay(2);
  expect(inert()).toEqual([true, false]);
  expect(document.querySelectorAll('.routine-day.is-open')).toHaveLength(1);
  await openDay(2);
  expect(inert()).toEqual([true, true]);
});

it('shows each planned set as a block, with muscles on request', async () => {
  const routine = structuredClone(original);
  const set = routine.days[0].movements[0].sets[0];
  routine.days[0].movements[0].sets = [set, set, set];
  routine.days.push({
    workout_type_id: 'cardio',
    workout_type: DEFAULT_WORKOUT_TYPES.find((type) => type.id === 'cardio')!,
    movements: [
      {
        exercise_id: 'run',
        exercise: { ...bench, id: 'run', name: 'Running', category: 'cardio', kind: 'cardio' },
        sets: [{ ...set, reps: null, duration_seconds: 2700 }],
      },
    ],
  });
  vi.mocked(api.routines.list).mockResolvedValue([routine]);
  await mount(true);
  const days = [...host.querySelectorAll('.routine-cycle > li')];
  expect(days.map((day) => day.querySelector('.routine-cycle-day')?.textContent)).toEqual([
    '1Upper body3 sets',
    '2Rest',
    '3Cardio45 min',
  ]);
  const pips = days[0].querySelector('.routine-pips')!;
  expect(pips.getAttribute('aria-label')).toBe('3 sets');
  expect(pips.querySelectorAll('i')).toHaveLength(3);
  expect(host.querySelector('.routine-cycle')?.textContent).not.toContain('×');
  expect(days[1].querySelector('.routine-cycle-empty')?.textContent).toBe('Rest day');
  expect(days[2].querySelector('.routine-cardio-length')?.textContent).toBe('45 min');
  expect(host.querySelector('.routine-exercise-label small')).toBeNull();
  await click('Muscles');
  expect(host.querySelector('.routine-exercise-label small')?.textContent).toBe('Chest');
});
