// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
import { optimisePhoto } from './photoOptimise';
import { localDate } from './utils';
import { readDashboardCache, writeDashboardCache } from './workoutCache';
import { readActiveWorkoutDraft, writeActiveWorkoutDraft } from './workoutDraft';
import { createWorkoutSet } from './workoutSets';
import type {
  DashboardData,
  Exercise,
  MachinePhoto,
  MachinePhotoUsage,
  TrackedWorkout,
} from './types';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    api: {
      ...original.api,
      workoutRevision: vi.fn().mockResolvedValue({ revision: 'initial' }),
      dashboard: vi.fn(),
      listExercises: vi.fn(),
      listWorkouts: vi.fn(),
      listBodyMeasurements: vi.fn(),
      listPersonalRecords: vi.fn(),
      getWorkoutTypeColors: vi.fn(),
      listMachinePhotos: vi.fn(),
      lastUsedMachinePhotos: vi.fn(),
      uploadMachinePhoto: vi.fn(),
      deleteMachinePhoto: vi.fn(),
      listAllMachinePhotos: vi.fn(),
      machinePhotoWorkouts: vi.fn(),
      exerciseLibrary: vi.fn().mockResolvedValue([]),
      exerciseProgress: vi.fn(),
    },
  };
});
vi.mock('./workoutCache', () => ({
  readDashboardCache: vi.fn().mockResolvedValue(null),
  writeDashboardCache: vi.fn().mockResolvedValue(undefined),
  readWorkoutCache: vi.fn().mockResolvedValue(null),
  writeWorkoutCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./photoOptimise', () => ({ optimisePhoto: vi.fn() }));

const legPress: Exercise = {
  id: 'leg-press',
  name: 'Leg Press',
  category: 'lower',
  kind: 'strength',
  muscle_group: 'Quads',
  equipment: 'Machine',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};

function photo(id: string, caption: string): MachinePhoto {
  return {
    id,
    exercise_id: legPress.id,
    caption,
    thumbnail_url: `/api/machine-photos/${id}/image?variant=thumbnail`,
    full_url: `/api/machine-photos/${id}/image?variant=full`,
    width: 64,
    height: 48,
    created_at: '2025-01-01T00:00:00Z',
  };
}

function usage(item: MachinePhoto, count: number, lastUsed: string | null): MachinePhotoUsage {
  return {
    ...item,
    exercise_name: legPress.name,
    workout_count: count,
    last_used_date: lastUsed,
  };
}

const homeGym = photo('home-gym', 'Home gym Hammer press');
const travelGym = photo('travel-gym', 'Travel gym Cybex press');

function workout(id: string, date: string, photos: MachinePhoto[], weight: number): TrackedWorkout {
  return {
    id,
    name: `Legs ${date}`,
    workout_date: date,
    category: 'lower',
    notes: null,
    duration_minutes: 45,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: `${date}T10:00:00Z`,
    updated_at: `${date}T10:00:00Z`,
    movements: [
      {
        id: `${id}-movement`,
        order_index: 0,
        notes: null,
        machine_photos: photos,
        superset_group_id: null,
        superset_name: null,
        exercise: legPress,
        sets: [
          {
            id: `${id}-set`,
            order_index: 0,
            weight_kg: weight,
            reps: 10,
            rpe: null,
            rest_seconds: null,
            duration_seconds: null,
            distance_km: null,
            incline_percent: null,
            speed_kph: null,
            bodyweight_kg: null,
            percentile: null,
            warmup: false,
            set_type: 'normal',
            failed: false,
            target_reps: null,
            notes: null,
            completed: true,
          },
        ],
      },
    ],
  };
}

// Newest first, as the API returns them: the home-gym machine was last used a year ago.
const recentTravel = workout('recent-travel', '2026-10-14', [travelGym], 140);
const unpinned = workout('unpinned', '2026-06-01', [], 150);
const yearAgoHome = workout('year-ago-home', '2025-10-12', [homeGym], 180);
const olderHome = workout('older-home', '2025-09-01', [homeGym], 170);
const workouts = [recentTravel, unpinned, yearAgoHome, olderHome];

let root: Root;
let container: HTMLDivElement;

function button(label: string, scope: ParentNode = document): HTMLButtonElement {
  const match = [...scope.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );
  if (!match) throw new Error(`No button labelled ${label}`);
  return match as HTMLButtonElement;
}

async function click(target: HTMLElement) {
  await act(async () => target.click());
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function historyCardTitles(): string[] {
  return [...container.querySelectorAll('.history-card-copy strong')].map(
    (item) => item.textContent ?? '',
  );
}

beforeEach(() => {
  vi.mocked(api.workoutRevision).mockResolvedValue({ revision: 'initial' });
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  Element.prototype.scrollIntoView = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:machine-preview');
  URL.revokeObjectURL = vi.fn();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  window.localStorage.clear();
  window.localStorage.setItem('gym-logger-reduce-motion', 'reduced');
  vi.mocked(api.dashboard).mockResolvedValue({
    recommendation: null,
    heatmap: [],
  } as unknown as DashboardData);
  vi.mocked(api.listExercises).mockResolvedValue([legPress]);
  vi.mocked(api.exerciseLibrary).mockResolvedValue([]);
  vi.mocked(api.exerciseProgress).mockResolvedValue({
    exercise: legPress,
    points: [],
    personal_best_weight_kg: 0,
    personal_best_estimated_1rm: 0,
  });
  vi.mocked(readDashboardCache).mockResolvedValue(null);
  vi.mocked(writeDashboardCache).mockResolvedValue(undefined);
  vi.mocked(optimisePhoto).mockImplementation(async (file: File) => file);
  vi.mocked(api.listWorkouts).mockResolvedValue(workouts);
  vi.mocked(api.listBodyMeasurements).mockResolvedValue([]);
  vi.mocked(api.listPersonalRecords).mockResolvedValue([]);
  vi.mocked(api.getWorkoutTypeColors).mockResolvedValue({
    upper: '#8b5cf6',
    lower: '#f59e0b',
    push: '#ef476f',
    pull: '#3b82f6',
    full_body: '#14b8a6',
    cardio: '#22c55e',
    other: '#94a3b8',
  });
  vi.mocked(api.listMachinePhotos).mockResolvedValue([usage(homeGym, 2, '2025-10-12')]);
  vi.mocked(api.lastUsedMachinePhotos).mockResolvedValue([]);
  vi.mocked(api.listAllMachinePhotos).mockResolvedValue([
    usage(travelGym, 1, '2026-10-14'),
    usage(homeGym, 2, '2025-10-12'),
  ]);
  vi.mocked(api.machinePhotoWorkouts).mockImplementation(async (photoId) =>
    workouts.filter((item) =>
      item.movements.some((movement) => movement.machine_photos.some((p) => p.id === photoId)),
    ),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('saving and pinning a machine photo while logging', () => {
  beforeEach(() => {
    const startedAt = Date.now() - 600_000;
    window.history.replaceState(null, '', '#log');
    writeActiveWorkoutDraft({
      version: 1,
      startedAt,
      updatedAt: startedAt,
      lastActiveAt: startedAt,
      inactiveFinishAt: startedAt + 3 * 60 * 60 * 1000,
      name: 'Leg day',
      workoutDate: localDate(),
      category: 'lower',
      notes: '',
      movements: [
        {
          key: 'leg-press-movement',
          exerciseId: legPress.id,
          notes: '',
          machinePhotoIds: [],
          supersetKey: null,
          isComplete: false,
          sets: [{ ...createWorkoutSet('strength'), key: 'set-1', reps: 10, weight_kg: 140 }],
        },
      ],
    });
  });

  async function stageNewPhoto() {
    const picker = container.querySelector<HTMLElement>('.machine-photo-picker')!;
    const input = picker.querySelector<HTMLInputElement>('input[type="file"][capture]')!;
    const file = new File(['machine'], 'cybex.jpg', { type: 'image/jpeg' });
    await act(async () => {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return { picker, file };
  }

  it('shows when each saved machine was last used', async () => {
    await act(async () => root.render(<App />));
    const card = container.querySelector('.machine-photo-rail article')!;
    expect(card.textContent).toContain('Home gym Hammer press');
    expect(card.querySelector('.machine-last-used')?.textContent).toMatch(/^Used .+ ago$/);
    expect(card.querySelector('.machine-last-used')?.getAttribute('title')).toBe(
      'Last used 12 Oct 2025',
    );
    const rail = container.querySelector('.machine-photo-rail')!;
    expect(rail.getAttribute('aria-label')).toBe('Saved equipment photos for Leg Press');
    expect(rail.getAttribute('tabindex')).toBe('0');
  });

  it('explains deletion from saved workouts and lets the user cancel', async () => {
    await act(async () => root.render(<App />));
    await click(button(`Expand ${homeGym.caption}`));
    await click(button('Delete'));
    const confirmation = container.querySelector('.photo-detail .inline-confirmation')!;
    expect(confirmation.textContent).toContain('Also removes this photo from saved workouts.');
    expect(
      document.getElementById(confirmation.getAttribute('aria-describedby')!)?.textContent,
    ).toBe('Also removes this photo from saved workouts.');
    expect(api.deleteMachinePhoto).not.toHaveBeenCalled();
    await click(button('Cancel', confirmation));
    expect(container.querySelector('.photo-detail')).not.toBeNull();
    expect(container.querySelector('.inline-confirmation')).toBeNull();
    expect(api.deleteMachinePhoto).not.toHaveBeenCalled();
  });

  it('deletes an older pinned photo and preserves the workout sets and other pins', async () => {
    vi.mocked(api.listMachinePhotos).mockResolvedValue([
      usage(homeGym, 2, '2025-10-12'),
      usage(travelGym, 1, '2026-10-14'),
    ]);
    vi.mocked(api.deleteMachinePhoto).mockResolvedValue(undefined);
    await act(async () => root.render(<App />));
    for (const card of container.querySelectorAll('.machine-photo-rail article')) {
      await click(button('Pin to sets', card));
    }
    const before = readActiveWorkoutDraft()!;
    await click(button(`Expand ${homeGym.caption}`));
    await click(button('Delete'));
    await click(button('Delete photo'));
    expect(api.deleteMachinePhoto).toHaveBeenCalledWith(homeGym.id, true);
    expect(container.querySelector('.photo-detail')).toBeNull();
    expect(container.querySelector('.machine-photo-rail')?.textContent).not.toContain(
      homeGym.caption,
    );
    expect(container.querySelector('.machine-photo-rail .selected')?.textContent).toContain(
      travelGym.caption,
    );
    expect(readActiveWorkoutDraft()?.movements[0].machinePhotoIds).toEqual([travelGym.id]);
    expect(readActiveWorkoutDraft()?.movements[0].sets).toEqual(before.movements[0].sets);
  });

  it('keeps the photo and draft on failure and can retry deleting the last photo', async () => {
    vi.mocked(api.deleteMachinePhoto)
      .mockRejectedValueOnce(new Error('Could not delete the photo. Try again.'))
      .mockResolvedValueOnce(undefined);
    await act(async () => root.render(<App />));
    await click(button('Pin to sets'));
    await click(button(`Expand ${homeGym.caption}`));
    await click(button('Delete'));
    await click(button('Delete photo'));
    expect(container.querySelector('.photo-detail [role="alert"]')?.textContent).toContain(
      'Could not delete the photo. Try again.',
    );
    expect(readActiveWorkoutDraft()?.movements[0].machinePhotoIds).toEqual([homeGym.id]);
    await click(button('Delete'));
    await click(button('Delete photo'));
    expect(api.deleteMachinePhoto).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.machine-photo-rail')).toBeNull();
    expect(readActiveWorkoutDraft()?.movements[0].machinePhotoIds).toEqual([]);
    expect(container.querySelector('.machine-photo-summary small')?.textContent).toBe(
      'Take or choose a photo',
    );
  });

  it('requires a machine name, then uploads the photo and pins it to every set', async () => {
    const created = photo('new-cybex', 'Travel gym Cybex press');
    vi.mocked(api.uploadMachinePhoto).mockResolvedValue(created);
    await act(async () => root.render(<App />));
    const { picker, file } = await stageNewPhoto();

    await click(button('Save and pin', picker));
    expect(picker.textContent).toContain('Enter the machine name before saving the photo.');
    expect(api.uploadMachinePhoto).not.toHaveBeenCalled();

    await type(
      picker.querySelector<HTMLInputElement>('input[placeholder="Machine name"]')!,
      '  Travel gym Cybex press ',
    );
    await click(button('Save and pin', picker));

    expect(api.uploadMachinePhoto).toHaveBeenCalledWith(
      legPress.id,
      file,
      'Travel gym Cybex press',
    );
    const pinned = [...picker.querySelectorAll('.machine-photo-rail article.selected')];
    expect(pinned.map((item) => item.querySelector('strong')?.textContent)).toEqual([
      'Travel gym Cybex press',
    ]);
    expect(pinned[0].querySelector('.machine-last-used')?.textContent).toBe('Not used yet');
    expect(picker.querySelector('.machine-photo-summary')?.textContent).toContain('1 pinned');
    expect(picker.querySelector('.machine-photo-summary small')?.textContent).toBe(
      'Travel gym Cybex press',
    );
    expect(readActiveWorkoutDraft()?.movements[0].machinePhotoIds).toEqual([created.id]);
  });

  it('keeps the staged photo and reports a failed upload without pinning', async () => {
    vi.mocked(api.uploadMachinePhoto).mockRejectedValue(new Error('Photo storage is full.'));
    await act(async () => root.render(<App />));
    const { picker } = await stageNewPhoto();
    await type(
      picker.querySelector<HTMLInputElement>('input[placeholder="Machine name"]')!,
      'Cybex',
    );
    await click(button('Save and pin', picker));

    expect(picker.textContent).toContain('Photo storage is full.');
    expect(picker.querySelector('.photo-inline-editor')).not.toBeNull();
    expect(readActiveWorkoutDraft()?.movements[0].machinePhotoIds).toEqual([]);
  });
});

describe('filtering History by machine', () => {
  beforeEach(() => window.history.replaceState(null, '', '#history'));

  it('keeps saved set types distinct, including legacy warm-ups, with their results and labels', async () => {
    const source = recentTravel.movements[0].sets[0];
    const sets = [
      { ...source, id: 'warmup', order_index: 0, set_type: 'warmup' as const, warmup: false },
      { ...source, id: 'legacy-warmup', order_index: 1, set_type: 'normal' as const, warmup: true },
      { ...source, id: 'working', order_index: 2 },
      { ...source, id: 'drop', order_index: 3, set_type: 'drop' as const },
      { ...source, id: 'failed', order_index: 4, failed: true },
    ];
    vi.mocked(api.listWorkouts).mockResolvedValue([
      { ...recentTravel, movements: [{ ...recentTravel.movements[0], sets }] },
    ]);
    await act(async () => root.render(<App />));
    await click(container.querySelector<HTMLButtonElement>('.history-card-summary')!);
    const pills = [...container.querySelectorAll('.history-set-pill')];
    expect(pills.map((item) => item.getAttribute('data-set-type'))).toEqual([
      'warmup',
      'warmup',
      'normal',
      'drop',
      'failure',
    ]);
    expect(pills.map((item) => item.querySelector('em')?.textContent)).toEqual([
      'Warm-up',
      'Warm-up',
      '',
      'Drop',
      'Failed',
    ]);
    expect(pills.every((item) => item.querySelector('span')?.textContent === '140 kg × 10')).toBe(
      true,
    );
  });

  it('replaces the Training header with an exercise back header and restores the searched list', async () => {
    await act(async () => root.render(<App />));
    await click(button('Exercises'));
    await type(
      container.querySelector<HTMLInputElement>('[aria-label="Search exercises"]')!,
      'Leg',
    );
    await click(
      container.querySelector<HTMLButtonElement>('[data-exercise-id="leg-press"]') ??
        container.querySelector<HTMLButtonElement>('.exercise-list-rows button')!,
    );
    expect(
      container.querySelector('.history-screen .overlay-header-copy strong')?.textContent,
    ).toBe('Leg Press');
    expect(container.querySelector('[aria-label="Training sections"]')).toBeNull();
    expect(container.querySelector('.training-back')).toBeNull();
    await click(container.querySelector<HTMLButtonElement>('[aria-label="Back to exercises"]')!);
    expect(container.querySelector('[aria-label="Training sections"]')).not.toBeNull();
    expect(
      container.querySelector<HTMLInputElement>('[aria-label="Search exercises"]')?.value,
    ).toBe('Leg');
  });

  it('keeps the calendar and open session when switching Training views and returning from Social', async () => {
    await act(async () => root.render(<App />));
    expect(container.querySelector('[aria-label="Workout calendar"]')).not.toBeNull();
    await click(container.querySelector<HTMLButtonElement>('.history-card-summary')!);
    expect(container.querySelector('.history-card.open')).not.toBeNull();
    await click(button('Exercises'));
    expect(container.querySelector('.exercise-list-library')).not.toBeNull();
    await click(button('Sessions'));
    expect(container.querySelector('.history-card.open')).not.toBeNull();
    await click(button('Social'));
    await click(button('Training'));
    expect(container.querySelector('.history-card.open')).not.toBeNull();
    expect(container.querySelector('[aria-label="Workout calendar"]')).not.toBeNull();
  });

  it('finds the last session on one machine among later sessions at other gyms', async () => {
    await act(async () => root.render(<App />));
    expect(historyCardTitles()).toHaveLength(1);
    await click(container.querySelector<HTMLButtonElement>('.show-more-button')!);
    expect(historyCardTitles()).toHaveLength(4);

    await click(button('Filter by machine'));
    const dialog = document.querySelector<HTMLElement>('.machine-filter-dialog')!;
    expect(dialog.textContent).toContain('Last used 12 Oct 2025');
    await click(
      [...dialog.querySelectorAll<HTMLButtonElement>('.machine-filter-list button')].find((item) =>
        item.textContent?.includes('Home gym Hammer press'),
      )!,
    );

    expect(api.machinePhotoWorkouts).toHaveBeenCalledWith(homeGym.id);
    expect(document.querySelector('.machine-filter-dialog')).toBeNull();
    const banner = container.querySelector('.machine-filter-banner')!;
    expect(banner.textContent).toContain('Home gym Hammer press');
    expect(banner.textContent).toContain('Leg Press');
    expect(banner.querySelector('.machine-filter-last')?.textContent).toMatch(
      /^Last used 12 Oct 2025 · .+ ago · 2 workouts$/,
    );
    expect(historyCardTitles()).toEqual(['Legs 2025-10-12', 'Legs 2025-09-01']);
    // Machine history spans years, so filtered cards include the year.
    expect(container.querySelector('.history-card-copy small')?.textContent).toMatch(/12 Oct 2025/);
    expect(container.querySelector('[aria-label="Workout calendar"]')).toBeNull();
    // The most recent session on that machine opens with the exercise highlighted.
    const opened = container.querySelector('.history-card.open')!;
    expect(opened.textContent).toContain('Legs 2025-10-12');
    expect(opened.querySelector('.targeted-exercise')?.textContent).toContain('180');

    await click(button('Close', banner));
    expect(container.querySelector('.machine-filter-banner')).toBeNull();
    expect(historyCardTitles()).toHaveLength(4);
  });

  it('filters from a pinned photo in a workout and explains an unused machine', async () => {
    await act(async () => root.render(<App />));
    await click(container.querySelector<HTMLButtonElement>('.history-card-summary')!);
    await click(button(`Expand ${travelGym.caption}`, container));
    await click(button('All workouts on this machine', container));

    expect(api.machinePhotoWorkouts).toHaveBeenCalledWith(travelGym.id);
    expect(historyCardTitles()).toEqual(['Legs 2026-10-14']);
    expect(container.querySelector('.machine-filter-last')?.textContent).toContain('1 workout');

    // The filtered machine's own photo does not offer to filter by itself again.
    await click(button(`Expand ${travelGym.caption}`, container));
    expect(() => button('All workouts on this machine', container)).toThrow();

    vi.mocked(api.listAllMachinePhotos).mockResolvedValue([usage(homeGym, 0, null)]);
    vi.mocked(api.machinePhotoWorkouts).mockResolvedValue([]);
    await click(button('Change', container));
    const dialog = document.querySelector<HTMLElement>('.machine-filter-dialog')!;
    expect(dialog.textContent).toContain('Not in a saved workout yet');
    await click(dialog.querySelector<HTMLButtonElement>('.machine-filter-list button')!);
    expect(container.querySelector('.machine-filter-last')?.textContent).toBe(
      'No saved workouts use this machine yet.',
    );
    expect(historyCardTitles()).toEqual([]);
  });
});
