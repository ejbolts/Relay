// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkoutShareCard, WorkoutSharePrompt } from './WorkoutShareCard';
import { WorkoutShareReminderSetting } from './WorkoutShareReminderSetting';
import { UserContext } from './userContext';
import {
  downloadWorkoutCard,
  defaultWorkoutCardStats,
  cardioWorkoutForSharing,
  workoutCardPng,
  workoutCardStats,
  workoutCardSvg,
} from './workoutCard';
import { createWorkoutSet } from './workoutSets';
import type { CardioSession, Exercise, TrackedSet, TrackedWorkout } from './types';

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
    expect(parsed.querySelector('image')?.getAttribute('href')).toMatch(/^data:image\/png;base64,/);
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

  it('defaults cardio and mixed workouts to distance/calories and keeps unfinished cardio out of defaults', () => {
    const cardio = { ...workout.movements[0], exercise: { ...exercise, kind: 'cardio' as const } };
    expect(defaultWorkoutCardStats({ ...workout, movements: [cardio] })).toEqual([
      'duration',
      'distance',
      'calories',
    ]);
    expect(
      defaultWorkoutCardStats({ ...workout, movements: [...workout.movements, cardio] }),
    ).toContain('distance');
    expect(
      defaultWorkoutCardStats({
        ...workout,
        movements: [{ ...cardio, sets: [set({ completed: false })] }],
      }),
    ).not.toContain('calories');
    expect(defaultWorkoutCardStats(workout)).not.toContain('distance');
    expect(defaultWorkoutCardStats({ ...workout, category: 'cardio', movements: [] })).toEqual([
      'duration',
      'distance',
      'calories',
    ]);
  });

  it('creates a compact self-contained card from standalone cardio without notes or a slogan', () => {
    const cardio = cardioWorkoutForSharing({
      id: 'run',
      activity_type: 'Running',
      session_date: '2026-11-08',
      duration_minutes: 30,
      distance_km: 5,
      calories_kcal: 300,
      notes: 'PRIVATE',
      created_at: '',
      updated_at: '',
    } as CardioSession);
    const stats = workoutCardStats(cardio, 'kg', 0).filter((stat) =>
      defaultWorkoutCardStats(cardio).includes(stat.id),
    );
    expect(stats.map((stat) => stat.value)).toEqual(['30 min', '5 km', '300 kcal']);
    const svg = workoutCardSvg({
      workout: cardio,
      stats,
      style: 'midnight',
      showDate: true,
      layout: 'compact',
    });
    const drawing = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(Number(drawing.documentElement.getAttribute('height'))).toBeLessThan(800);
    expect(svg).not.toContain('BUILT ONE SESSION');
    expect(svg).not.toContain('PRIVATE');
    expect(drawing.querySelector('image')?.getAttribute('href')).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(workoutCardSvg({ workout, stats: [], style: 'paper', showDate: false })).not.toContain(
      'BUILT ONE SESSION',
    );
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
  window.localStorage.clear();
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
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
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

it('copies the prepared compact PNG and preserves a download fallback if clipboard access is denied', async () => {
  const write = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } });
  vi.stubGlobal(
    'ClipboardItem',
    class {
      constructor(public data: Record<string, Blob>) {}
    },
  );
  await mount();
  await act(async () => checkbox('Compact').click());
  expect(previewSvg()).not.toContain('height="1350"');
  expect(workoutCardPng).toHaveBeenLastCalledWith(previewSvg());
  await act(async () => button('Copy image').click());
  expect(write.mock.calls[0][0][0].data['image/png'].type).toBe('image/png');
  expect(document.querySelector('dialog [role="status"]')?.textContent).toContain('Card copied');
  await act(async () => button('Copy image').click());
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    'Download the PNG instead',
  );
  expect(button('Download PNG').disabled).toBe(false);
});

it('keeps unsupported clipboard disabled and offers sharing through a non-blocking dismissible toast', async () => {
  await mount();
  expect(button('Copy image').disabled).toBe(true);
  await act(async () =>
    root.render(
      <WorkoutSharePrompt key="prompt" workout={workout} records={2} onClose={onClose} />,
    ),
  );
  expect(document.querySelector('dialog, [aria-modal="true"]')).toBeNull();
  expect(document.querySelector('.app-notification-toast')?.textContent).toContain('Workout saved');
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Close notification"]')!.click(),
  );
  expect(onClose).toHaveBeenCalledOnce();
  await act(async () => button('Share card').click());
  expect(document.querySelector('dialog h2')?.textContent).toBe('Share workout');
  expect(document.querySelectorAll('dialog')).toHaveLength(1);
});

it('keeps Settings and the card toggle synchronized, persists disabling and preserves manual sharing', async () => {
  await act(async () =>
    root.render(
      <>
        <WorkoutShareReminderSetting />
        <WorkoutShareCard workout={workout} records={0} onClose={onClose} />
      </>,
    ),
  );
  const switches = () => [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[role="switch"][aria-label="Share workout reminder"]',
    ),
  ];
  expect(switches().map((item) => item.getAttribute('aria-checked'))).toEqual(['true', 'true']);
  await act(async () => switches()[1].click());
  expect(switches().map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'false']);
  expect(document.querySelector('dialog')).not.toBeNull();
  expect(window.localStorage.getItem('relay-workout-share-reminder:device')).toBe('off');
  await act(async () =>
    root.render(<WorkoutSharePrompt workout={workout} records={0} onClose={onClose} />),
  );
  expect(document.querySelector('.notification-toast-action')).toBeNull();
  expect(onClose).toHaveBeenCalledOnce();
  await mount();
  expect(switches()[0].getAttribute('aria-checked')).toBe('false');
  expect(button('Download PNG').disabled).toBe(false);
  await act(async () => switches()[0].click());
  await act(async () =>
    root.render(<WorkoutSharePrompt workout={workout} records={0} onClose={onClose} />),
  );
  expect(document.querySelector('.notification-toast-action')).not.toBeNull();
});

it('keeps reminder choices isolated between signed-in accounts', async () => {
  const user = (id: string) => ({
    user: { id } as import('./types').User,
    updateUser: () => {},
    signOut: async () => {},
    accountDeleted: async () => {},
  });
  const render = (id: string) =>
    root.render(
      <UserContext.Provider value={user(id)}>
        <WorkoutShareReminderSetting />
      </UserContext.Provider>,
    );
  await act(async () => render('first'));
  await act(async () => document.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  await act(async () => render('second'));
  expect(document.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
  await act(async () => render('first'));
  expect(document.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
});
