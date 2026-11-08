// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkoutShareCard } from './WorkoutShareCard';
import {
  downloadWorkoutCard,
  workoutCardPng,
  workoutCardStats,
  workoutCardSvg,
} from './workoutCard';
import { createWorkoutSet } from './workoutSets';
import type { Exercise, TrackedSet, TrackedWorkout } from './types';

vi.mock('./workoutCard', async (original) => ({
  ...(await original<typeof import('./workoutCard')>()),
  workoutCardPng: vi.fn(),
  downloadWorkoutCard: vi.fn(),
}));

const exercise: Exercise = {
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
const set = (extra: Partial<TrackedSet> = {}): TrackedSet => ({
  ...createWorkoutSet('strength', undefined, false),
  incline_percent: null,
  speed_kph: null,
  bodyweight_kg: null,
  percentile: null,
  warmup: false,
  set_type: 'normal',
  failed: false,
  target_reps: null,
  id: 'set',
  order_index: 0,
  reps: 10,
  weight_kg: 50,
  completed: true,
  ...extra,
});
const workout: TrackedWorkout = {
  id: 'sample',
  name: 'Push & progress',
  category: 'push',
  workout_date: '2026-11-08',
  notes: 'PRIVATE workout note',
  duration_minutes: 52,
  start_time: null,
  end_time: null,
  is_sample: true,
  created_at: '2026-11-08T10:00:00Z',
  updated_at: '2026-11-08T10:00:00Z',
  movements: [
    {
      id: 'movement',
      order_index: 0,
      exercise,
      notes: 'PRIVATE movement note',
      machine_photos: [],
      superset_group_id: null,
      superset_name: null,
      sets: [
        set(),
        set({ id: 'warmup', warmup: true, set_type: 'warmup' }),
        set({ id: 'unfinished', completed: false }),
        set({ id: 'missed', failed: true, reps: 0 }),
        set({ id: 'partial', failed: true, reps: 3 }),
        set({ id: 'cardio', weight_kg: null, reps: null, distance_km: 2.5, calories_kcal: 180 }),
      ],
    },
  ],
};

describe('card data and drawing', () => {
  it('uses completed working sets, preserves partial attempts and converts the preferred weight unit', () => {
    const stats = Object.fromEntries(
      workoutCardStats(workout, 'kg', 2).map((stat) => [stat.id, stat.value]),
    );
    expect(stats).toEqual({
      duration: '52 min',
      exercises: '1',
      sets: '3',
      reps: '13',
      volume: '650 kg',
      distance: '2.5 km',
      calories: '180 kcal',
      records: '2',
    });
    expect(workoutCardStats(workout, 'lb', 0).find((stat) => stat.id === 'volume')?.value).toBe(
      '1,433 lb',
    );
    expect(
      workoutCardStats({ ...workout, movements: [], duration_minutes: null }, 'kg', 0).find(
        (stat) => stat.id === 'duration',
      )?.value,
    ).toBe('—');
  });

  it('exports only chosen stats and date, escapes titles and excludes all notes and identifiers', () => {
    const drawing = workoutCardSvg({
      workout: { ...workout, name: '<script> & "go"' },
      stats: workoutCardStats(workout, 'kg', 2).filter((stat) => stat.id === 'sets'),
      style: 'paper',
      showDate: false,
    });
    expect(drawing).toContain('&lt;script&gt; &amp; &quot;go&quot;');
    expect(drawing).toContain('Working sets');
    expect(drawing).not.toContain('Volume');
    expect(drawing).not.toContain('November');
    expect(drawing).not.toContain('PRIVATE');
    const parsed = new DOMParser().parseFromString(drawing, 'image/svg+xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(parsed.querySelector('script')).toBeNull();
  });

  it('keeps long Unicode names and all eight stats within a fixed portrait export', () => {
    const drawing = workoutCardSvg({
      workout: { ...workout, name: '🏋️ Longer workout name with several extra words and emoji 💪' },
      stats: workoutCardStats(workout, 'kg', 0),
      style: 'midnight',
      showDate: true,
    });
    expect(drawing).toContain('width="1080" height="1350"');
    expect(drawing).toContain('8 November 2026');
    expect(drawing).toContain('…');
    expect(
      new DOMParser().parseFromString(drawing, 'image/svg+xml').querySelector('parsererror'),
    ).toBeNull();
    expect(
      workoutCardSvg({
        workout: { ...workout, name: 'WWWWWWWWWWWWWWWWWW' },
        stats: [],
        style: 'paper',
        showDate: false,
      }),
    ).toContain('textLength="940"');
  });
});

let root: Root;
let container: HTMLDivElement;
const onClose = vi.fn();
function button(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent === text,
  )!;
}
function checkbox(text: string) {
  return [...document.querySelectorAll<HTMLLabelElement>('label')]
    .find((label) => label.textContent?.includes(text))!
    .querySelector<HTMLInputElement>('input')!;
}
function previewSvg() {
  return decodeURIComponent(
    document.querySelector<HTMLImageElement>('.workout-share-preview img')!.src.split(',')[1],
  );
}
async function mount() {
  await act(async () =>
    root.render(<WorkoutShareCard workout={workout} records={2} onClose={onClose} />),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.mocked(workoutCardPng).mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('updates individually selected stats, date and style in the drawing used for PNG download', async () => {
  await mount();
  expect(document.querySelector('dialog')?.open).toBe(true);
  expect(button('Share image')).toBeUndefined();
  await act(async () => checkbox('Volume').click());
  await act(async () => checkbox('Workout date').click());
  await act(async () => checkbox('Paper').click());
  expect(previewSvg()).not.toContain('Volume');
  expect(previewSvg()).not.toContain('November');
  expect(previewSvg()).toContain('#f3f5f7');
  expect(workoutCardPng).toHaveBeenLastCalledWith(previewSvg());
  await act(async () => button('Download PNG').click());
  const file = vi.mocked(downloadWorkoutCard).mock.calls[0][0];
  expect(file.name).toBe('relay-workout-2026-11-08.png');
  expect(file.type).toBe('image/png');
  expect(document.querySelector('[role="status"]')?.textContent).toContain('Card downloaded');
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Close Share workout"]')!.click(),
  );
  expect(onClose).toHaveBeenCalled();
});

it('disables export while rebuilding and ignores an obsolete PNG result', async () => {
  await mount();
  let first!: (value: Blob) => void;
  let second!: (value: Blob) => void;
  vi.mocked(workoutCardPng)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          first = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          second = resolve;
        }),
    );
  await act(async () => checkbox('Volume').click());
  expect(button('Preparing…').disabled).toBe(true);
  await act(async () => checkbox('Reps').click());
  await act(async () => second(new Blob(['newest'])));
  await act(async () => first(new Blob(['obsolete-longer'])));
  await act(async () => button('Download PNG').click());
  expect(vi.mocked(downloadWorkoutCard).mock.calls[0][0].size).toBe(6);
});

it('allows an image with no stats and retries an image preparation failure', async () => {
  vi.mocked(workoutCardPng).mockRejectedValueOnce(
    new Error('Could not export the image. Try again.'),
  );
  await mount();
  expect(button('Download PNG').disabled).toBe(true);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Could not export');
  await act(async () => button('Retry').click());
  expect(button('Download PNG').disabled).toBe(false);
  for (const input of document.querySelectorAll<HTMLInputElement>('input[type=checkbox]:checked')) {
    await act(async () => input.click());
  }
  expect(previewSvg()).not.toContain('Working sets');
  expect(previewSvg()).not.toContain('Volume');
  expect(button('Download PNG').disabled).toBe(false);
});

it('shares a prepared PNG synchronously from the click, treats cancellation quietly and offers download on failure', async () => {
  const share = vi
    .fn()
    .mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
    .mockRejectedValueOnce(new Error('Blocked'))
    .mockResolvedValueOnce(undefined);
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  await mount();
  await act(async () => button('Share image').click());
  expect(share.mock.calls[0][0].files[0].type).toBe('image/png');
  expect(document.querySelector('[role="alert"]')).toBeNull();
  await act(async () => button('Share image').click());
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    'Download the PNG instead',
  );
  expect(button('Download PNG').disabled).toBe(false);
  await act(async () => button('Share image').click());
  expect(document.querySelector('dialog [role="status"]')?.textContent).toContain('Card shared');
});
