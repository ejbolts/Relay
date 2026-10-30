// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProgressScreen } from './App';
import { api } from './api';
import { useExerciseLibrary } from './useExerciseLibrary';
import type { Exercise, ExerciseLibrarySummary, ExerciseProgress, TrackedWorkout } from './types';

const pec: Exercise = {
  id: 'pec',
  name: 'Pec Deck',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Machine',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const row = { ...pec, id: 'row', name: 'Cable Row', muscle_group: 'Back', equipment: 'Cable' };
const empty = { ...pec, id: 'empty', name: 'Untrained Press' };
const catalogue = [pec, row, empty];
function progress(exercise: Exercise, value = 100): ExerciseProgress {
  return {
    exercise,
    personal_best_weight_kg: value,
    personal_best_estimated_1rm: value,
    points: Array.from({ length: 10 }, (_, index) => ({
      workout_id: `session-${index}`,
      workout_date: `2026-10-${String(index + 1).padStart(2, '0')}`,
      estimated_1rm: value - 10 + index,
      best_weight_kg: 60 + index,
      best_reps: 8,
      volume_kg: 1000 + index * 10,
      best_rpe: 8,
    })),
  };
}
const summaries: ExerciseLibrarySummary[] = [
  {
    exercise_id: 'pec',
    session_count: 10,
    last_date: '2026-10-24',
    latest_estimated_1rm: 100,
    change_kg: 20,
    change_percent: 25,
    trend: [
      { date: '2026-10-01', estimated_1rm: 80 },
      { date: '2026-10-24', estimated_1rm: 100 },
    ],
  },
  {
    exercise_id: 'row',
    session_count: 5,
    last_date: '2026-10-23',
    latest_estimated_1rm: 90,
    change_kg: 30,
    change_percent: 50,
    trend: [
      { date: '2026-10-01', estimated_1rm: 60 },
      { date: '2026-10-23', estimated_1rm: 90 },
    ],
  },
];
let root: Root, host: HTMLDivElement;
const onOpenWorkout = vi.fn();
const named = (name: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
const click = async (element: Element) => act(async () => (element as HTMLElement).click());
function LibraryScreen({
  revision,
  exercises,
}: {
  revision: string | null;
  exercises: Exercise[];
}) {
  const exerciseLibrary = useExerciseLibrary(exercises, revision);
  return (
    <ProgressScreen
      exerciseLibrary={exerciseLibrary}
      exercises={exercises}
      measurements={[]}
      personalRecords={[]}
      onOpenWorkout={onOpenWorkout}
      embedded
      browseFirst
      dataRevision={revision}
    />
  );
}
async function render(revision: string | null = null, exercises: Exercise[] = catalogue) {
  await act(async () => root.render(<LibraryScreen revision={revision} exercises={exercises} />));
}
async function search(value: string) {
  const input = host.querySelector<HTMLInputElement>('[aria-label="Search exercises"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.spyOn(api, 'exerciseLibrary').mockResolvedValue(summaries);
  vi.spyOn(api, 'exerciseProgress').mockImplementation(async (id) =>
    progress(catalogue.find((e) => e.id === id)!),
  );
  onOpenWorkout.mockReset();
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

it('opens on a full list, with one summary request and no automatically selected detail', async () => {
  await render();
  expect(host.querySelectorAll('.exercise-list-rows li')).toHaveLength(3);
  expect(api.exerciseLibrary).toHaveBeenCalledTimes(1);
  expect(api.exerciseProgress).not.toHaveBeenCalled();
  expect(host.querySelector('[aria-label="Full exercise progress"]')?.hasAttribute('hidden')).toBe(
    true,
  );
  expect(host.querySelector('.exercise-list-rows button')?.textContent).toContain('Pec Deck');
});
it('combines equipment, muscle and reordered search, retaining equipment after detail', async () => {
  await render();
  const equipment = host.querySelector<HTMLSelectElement>('[aria-label="Equipment"]')!;
  await act(async () => {
    equipment.value = 'Cable';
    equipment.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click(named('Back'));
  await search('back cable row');
  expect(host.querySelectorAll('.exercise-list-rows li')).toHaveLength(1);
  await click(host.querySelector('[data-exercise-id="row"]')!);
  await click(host.querySelector('.training-back')!);
  expect(equipment.value).toBe('Cable');
  await search('machine');
  expect(host.querySelectorAll('.exercise-list-rows li')).toHaveLength(0);
  expect(host.querySelector('[role="status"]')?.textContent).toContain('No exercises match');
});
it('combines the Custom pill with equipment and muscle filters and preserves it after detail', async () => {
  await render(
    null,
    catalogue.map((exercise) => ({ ...exercise, is_custom: exercise.id === 'row' })),
  );
  const custom = host.querySelector('[aria-label="Custom exercises"]')!;
  expect(custom.getAttribute('aria-pressed')).toBe('false');
  await click(custom);
  expect(host.querySelectorAll('.exercise-list-rows li')).toHaveLength(1);
  await click(named('Back'));
  const equipment = host.querySelector<HTMLSelectElement>('[aria-label="Equipment"]')!;
  await act(async () => {
    equipment.value = 'Cable';
    equipment.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await search('row');
  await click(host.querySelector('[data-exercise-id="row"]')!);
  await click(host.querySelector('.training-back')!);
  expect(custom.getAttribute('aria-pressed')).toBe('true');
  await click(host.querySelector('[aria-label="Clear search"]')!);
  await act(async () => {
    equipment.value = 'Machine';
    equipment.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(host.querySelectorAll('.exercise-list-rows li')).toHaveLength(0);
  await click(custom);
  await click(named('All'));
  expect(host.querySelectorAll('.exercise-list-rows li')).toHaveLength(2);
});
it('searches, filters, clears and cycles through recent, alphabetical and improvement ordering', async () => {
  await render();
  const input = await search('Press');
  expect(host.querySelectorAll('.exercise-list-rows li')).toHaveLength(1);
  await click(host.querySelector('[aria-label="Clear search"]')!);
  expect(document.activeElement).toBe(input);
  await click(named('Back'));
  expect(host.querySelectorAll('.exercise-list-rows li')).toHaveLength(1);
  await click(named('All'));
  await click(host.querySelector('[aria-label="Sort exercises: Recent first"]')!);
  expect(host.querySelector('.exercise-list-rows button')?.textContent).toContain('Cable Row');
  await click(host.querySelector('[aria-label="Sort exercises: A–Z"]')!);
  expect(host.querySelector('.exercise-list-rows button')?.textContent).toContain('Cable Row');
  await click(host.querySelector('[aria-label="Sort exercises: Most improved"]')!);
  expect(host.querySelector('.exercise-list-rows button')?.textContent).toContain('Pec Deck');
  await search('<nothing>');
  expect(host.querySelector('[role="status"]')?.textContent).toContain('No exercises match');
});
it('opens detail immediately and preserves search, range and scroll on returning', async () => {
  await render();
  await search('Pec');
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(240);
  await click(host.querySelector('[data-exercise-id="pec"]')!);
  expect(host.querySelector('[aria-label="Full exercise progress"]')?.hasAttribute('hidden')).toBe(
    false,
  );
  expect(host.querySelector('[aria-label="Personal bests"]')).not.toBeNull();
  await click(host.querySelector('[aria-label="1 year"]')!);
  await click(host.querySelector('.training-back')!);
  await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 240, behavior: 'instant' });
  expect(host.querySelector<HTMLInputElement>('[aria-label="Search exercises"]')?.value).toBe(
    'Pec',
  );
  await click(host.querySelector('[data-exercise-id="pec"]')!);
  expect(host.querySelector('[aria-label="1 year"]')?.getAttribute('aria-selected')).toBe('true');
});
it('loads the selected session sets in a sheet before opening the actual workout', async () => {
  const workout = {
    id: 'session-9',
    name: 'Upper body',
    workout_date: '2026-10-10',
    movements: [
      {
        id: 'movement',
        exercise: pec,
        notes: null,
        sets: [{ id: 'set', weight_kg: 69, reps: 8, rpe: 8, completed: true }],
      },
    ],
  } as TrackedWorkout;
  vi.spyOn(api, 'getWorkout').mockResolvedValue(workout);
  await render();
  await click(host.querySelector('[data-exercise-id="pec"]')!);
  expect(host.querySelectorAll('.progress-sessions li')).toHaveLength(5);
  await click(host.querySelector('.show-more-button')!);
  expect(host.querySelectorAll('.progress-sessions li')).toHaveLength(10);
  await click(host.querySelector('.progress-sessions li button')!);
  expect(document.querySelector('dialog')?.textContent).toContain('69 kg');
  expect(onOpenWorkout).not.toHaveBeenCalled();
  await click(document.querySelector('dialog .primary')!);
  expect(onOpenWorkout).toHaveBeenCalledWith('session-9', 'pec');
  expect(document.querySelector('dialog')).toBeNull();
});
it('retries summary and detail failures and keeps the list usable for untrained exercises', async () => {
  vi.mocked(api.exerciseLibrary).mockRejectedValueOnce(new Error('Offline'));
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'Could not load exercise trends',
  );
  await click(named('Retry'));
  expect(host.querySelector('[role="alert"]')).toBeNull();
  vi.mocked(api.exerciseProgress).mockRejectedValueOnce(new Error('Offline'));
  await click(host.querySelector('[data-exercise-id="pec"]')!);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'Could not load exercise progress',
  );
  await click(named('Retry'));
  expect(host.querySelector('.progress-hero-value')?.textContent).toContain('99');
  await click(host.querySelector('.training-back')!);
  vi.mocked(api.exerciseProgress).mockResolvedValue({ ...progress(empty), points: [] });
  await click(host.querySelector('[data-exercise-id="empty"]')!);
  expect(host.querySelector('[aria-label="Full exercise progress"]')?.textContent).toContain(
    'No data yet',
  );
});
it('refreshes list trends and open details after remote changes without losing the filter', async () => {
  await render();
  await search('Pec');
  await click(host.querySelector('[data-exercise-id="pec"]')!);
  vi.mocked(api.exerciseProgress).mockResolvedValue(progress(pec, 130));
  await render('changed');
  expect(host.querySelector('.progress-hero-value')?.textContent).toContain('129');
  await click(host.querySelector('.training-back')!);
  expect(host.querySelector<HTMLInputElement>('[aria-label="Search exercises"]')?.value).toBe(
    'Pec',
  );
  expect(api.exerciseLibrary).toHaveBeenCalledTimes(2);
});

it('ignores stale detail responses after returning to the list and choosing another lift', async () => {
  let finishPec!: (value: ExerciseProgress) => void;
  let finishRow!: (value: ExerciseProgress) => void;
  vi.mocked(api.exerciseProgress).mockImplementation(
    (id) =>
      new Promise((resolve) => {
        if (id === 'pec') finishPec = resolve;
        else finishRow = resolve;
      }),
  );
  await render();
  await click(host.querySelector('[data-exercise-id="pec"]')!);
  await click(host.querySelector('.training-back')!);
  await click(host.querySelector('[data-exercise-id="row"]')!);
  await act(async () => finishPec(progress(pec, 200)));
  expect(host.querySelector('.progress-hero-value')).toBeNull();
  await act(async () => finishRow(progress(row, 90)));
  expect(host.querySelector('.progress-hero-value')?.textContent).toContain('89');
});

it('keeps loaded graphs and ordering visible during a refresh and ignores an older response', async () => {
  await render('initial');
  const points = host.querySelector('.exercise-list-spark polyline')!.getAttribute('points');
  let finishOld!: (value: ExerciseLibrarySummary[]) => void;
  let finishNew!: (value: ExerciseLibrarySummary[]) => void;
  vi.mocked(api.exerciseLibrary)
    .mockImplementationOnce(() => new Promise((resolve) => (finishOld = resolve)))
    .mockImplementationOnce(() => new Promise((resolve) => (finishNew = resolve)));
  await search('Pec');
  await render('older');
  expect(host.querySelector('.exercise-list-spark polyline')?.getAttribute('points')).toBe(points);
  expect(host.textContent).not.toContain('Loading trends');
  await render('newer');
  await act(async () => finishNew([{ ...summaries[0], latest_estimated_1rm: 130 }]));
  await act(async () => finishOld(summaries));
  expect(host.querySelector('.exercise-list-value b')?.textContent).toContain('130');
  expect(host.querySelector<HTMLInputElement>('[aria-label="Search exercises"]')?.value).toBe(
    'Pec',
  );
});

it('refreshes trends after adding an exercise and keeps the previous graphs if the refresh fails', async () => {
  await render();
  vi.mocked(api.exerciseLibrary).mockRejectedValueOnce(new Error('Offline'));
  await render(null, [...catalogue, { ...pec, id: 'new', name: 'New press' }]);
  expect(api.exerciseLibrary).toHaveBeenCalledTimes(2);
  expect(host.querySelector('.exercise-list-spark polyline')).not.toBeNull();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'Could not load exercise trends',
  );
  await click(named('Retry'));
  expect(api.exerciseLibrary).toHaveBeenCalledTimes(3);
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it('retries a failed session read and keeps the workout action unavailable until it loads', async () => {
  const workout: TrackedWorkout = {
    id: 'session-9',
    name: 'Upper body',
    workout_date: '2026-10-10',
    category: 'upper',
    notes: null,
    duration_minutes: 60,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: '',
    updated_at: '',
    movements: [
      {
        id: 'movement',
        order_index: 0,
        exercise: pec,
        notes: null,
        sets: [],
        machine_photos: [],
        superset_group_id: null,
        superset_name: null,
      },
    ],
  };
  vi.spyOn(api, 'getWorkout')
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue(workout);
  await render();
  await click(host.querySelector('[data-exercise-id="pec"]')!);
  await click(host.querySelector('.progress-sessions li button')!);
  expect(document.querySelector('dialog [role="alert"]')?.textContent).toContain(
    'Could not load this session',
  );
  expect(document.querySelector('dialog .primary')).toBeNull();
  await click(document.querySelector('dialog .text-link')!);
  expect(document.querySelector('dialog .primary')).not.toBeNull();
  vi.mocked(api.getWorkout).mockResolvedValue({ ...workout, name: 'Updated upper body' });
  await render('remote-sheet-change');
  expect(document.querySelector('dialog')?.textContent).toContain('Updated upper body');
  await click(document.querySelector('dialog .popup-dialog-close')!);
  expect(document.querySelector('dialog')).toBeNull();
});
