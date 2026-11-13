// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
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
      mergeMachinePhotos: vi.fn(),
      getMachineSettings: vi.fn(),
      saveMachineSettings: vi.fn(),
      lastUsedMachinePhotos: vi.fn(),
      uploadMachinePhoto: vi.fn(),
      deleteMachinePhoto: vi.fn(),
      updateMachinePhoto: vi.fn(),
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
  vi.mocked(api.getMachineSettings).mockResolvedValue({ settings: [] });
  vi.mocked(api.saveMachineSettings).mockImplementation(async (_exerciseId, settings) => ({
    settings,
  }));
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

  it('adds exercises with the machine chosen in the picker, keeping a baseline choice unpinned', async () => {
    const chestPress: Exercise = {
      ...legPress,
      id: 'chest-press',
      name: 'Chest Press',
      category: 'push',
      muscle_group: 'Chest',
    };
    const rowPull: Exercise = { ...chestPress, id: 'row-pull', name: 'Seated Row' };
    const chestHammer = {
      ...photo('chest-hammer', 'Hammer chest press'),
      exercise_id: chestPress.id,
    };
    const rowCybex = { ...photo('row-cybex', 'Cybex row'), exercise_id: rowPull.id };
    const rowMatrix = { ...photo('row-matrix', 'Matrix row'), exercise_id: rowPull.id };
    vi.mocked(api.listExercises).mockResolvedValue([legPress, chestPress, rowPull]);
    vi.mocked(api.listAllMachinePhotos).mockResolvedValue([
      { ...usage(chestHammer, 3, '2026-10-20'), exercise_name: chestPress.name },
      { ...usage(rowCybex, 2, '2026-10-18'), exercise_name: rowPull.name },
      { ...usage(rowMatrix, 1, '2026-09-01'), exercise_name: rowPull.name },
    ]);
    // Without the picker's choice, the logger would pin these last-used machines itself.
    vi.mocked(api.lastUsedMachinePhotos).mockImplementation(async (exerciseId) =>
      exerciseId === chestPress.id ? [chestHammer] : exerciseId === rowPull.id ? [rowCybex] : [],
    );
    // jsdom has no element scrolling; the picker resets its list scroll when it opens.
    HTMLElement.prototype.scrollTo = vi.fn();
    onTestFinished(() => {
      delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
    });
    await act(async () => root.render(<App />));
    await click(container.querySelector<HTMLButtonElement>('.add-exercise-button')!);
    const row = (id: string) => document.querySelector<HTMLElement>(`[data-exercise-id="${id}"]`)!;
    const card = (id: string) =>
      document.querySelector<HTMLButtonElement>(`.exercise-machine-card[data-machine-id="${id}"]`)!;

    await click(row(chestPress.id).querySelector<HTMLButtonElement>('.exercise-option-select')!);
    expect(card(chestHammer.id).getAttribute('aria-pressed')).toBe('true');
    await click(card(chestHammer.id));
    expect(row(chestPress.id).querySelector('.exercise-option-machine')?.textContent).toBe(
      'Baseline exercise',
    );
    await click(row(rowPull.id).querySelector<HTMLButtonElement>('.exercise-option-select')!);
    await click(card(rowMatrix.id));
    await click(document.querySelector<HTMLButtonElement>('.add-selected-button')!);

    const movements = readActiveWorkoutDraft()!.movements;
    expect(
      movements.map(({ exerciseId, machinePhotoIds }) => ({ exerciseId, machinePhotoIds })),
    ).toEqual([
      { exerciseId: legPress.id, machinePhotoIds: [] },
      { exerciseId: chestPress.id, machinePhotoIds: [] },
      { exerciseId: rowPull.id, machinePhotoIds: [rowMatrix.id] },
    ]);
    expect(api.lastUsedMachinePhotos).not.toHaveBeenCalledWith(chestPress.id);
    expect(api.lastUsedMachinePhotos).not.toHaveBeenCalledWith(rowPull.id);
  });

  it("pre-fills an exercise added on a chosen machine from that machine's last session", async () => {
    writeActiveWorkoutDraft({ ...readActiveWorkoutDraft()!, movements: [] });
    HTMLElement.prototype.scrollTo = vi.fn();
    onTestFinished(() => {
      delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
    });
    await act(async () => root.render(<App />));
    await click(container.querySelector<HTMLButtonElement>('.add-exercise-button')!);
    await click(
      document
        .querySelector(`[data-exercise-id="${legPress.id}"]`)!
        .querySelector<HTMLButtonElement>('.exercise-option-select')!,
    );
    const homeCard = document.querySelector<HTMLButtonElement>(
      `.exercise-machine-card[data-machine-id="${homeGym.id}"]`,
    )!;
    if (homeCard.getAttribute('aria-pressed') !== 'true') await click(homeCard);
    await click(document.querySelector<HTMLButtonElement>('.add-selected-button')!);

    const [movement] = readActiveWorkoutDraft()!.movements;
    expect(movement.machinePhotoIds).toEqual([homeGym.id]);
    // The latest session overall was on the travel gym's machine at 140 kg.
    expect(movement.sets.map((item) => item.weight_kg)).toEqual([180]);
    expect(container.querySelector('.movement-last-session')?.textContent).toContain('12 Oct');
  });

  it('edits settings for an existing machine and saves to that machine', async () => {
    await act(async () => root.render(<App />));
    await click(button(`Expand ${homeGym.caption}`));
    await click(button('Edit machine settings'));
    expect(api.getMachineSettings).toHaveBeenCalledWith(legPress.id, homeGym.id);
    const input = container.querySelector<HTMLInputElement>('[aria-label="Setting 1 name"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'Seat');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const value = container.querySelector<HTMLInputElement>('[aria-label="Seat value"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(value, '4');
      value.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(button('Save'));
    expect(api.saveMachineSettings).toHaveBeenCalledWith(
      legPress.id,
      [{ name: 'Seat', value: '4' }],
      homeGym.id,
    );
    expect(container.querySelector('.machine-settings')).toBeNull();
    expect(document.querySelector('.app-notification-toast')?.textContent).toContain(
      'Machine settings saved',
    );
  });
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

  it('confirms a saved machine name, restarts the timeout and allows early dismissal', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    vi.mocked(api.updateMachinePhoto).mockImplementation(async (_id, caption) => ({
      ...homeGym,
      caption,
    }));
    await act(async () => root.render(<App />));
    await click(button(`Expand ${homeGym.caption}`));
    const input = container.querySelector<HTMLInputElement>('.photo-detail-caption input')!;
    const notice = () => document.querySelector('.app-notification-toast');

    await type(input, '  Hammer leg press  ');
    input.focus();
    await click(button('Save name'));
    expect(api.updateMachinePhoto).toHaveBeenCalledWith(homeGym.id, 'Hammer leg press');
    expect(notice()?.textContent).toContain('Machine name saved');
    expect(container.querySelector('.photo-detail')?.getAttribute('aria-label')).toBe(
      'Hammer leg press',
    );
    expect(document.activeElement).toBe(input);

    await act(async () => vi.advanceTimersByTime(4000));
    await type(input, 'Hammer leg press 2');
    await click(button('Save name'));
    await act(async () => vi.advanceTimersByTime(7999));
    expect(notice()).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(1));
    expect(notice()).toBeNull();

    await type(input, 'Hammer leg press 3');
    await click(button('Save name'));
    expect(notice()).not.toBeNull();
    await click(button('Close notification'));
    expect(notice()).toBeNull();
  });

  it('waits for the machine name to save and keeps failures beside the input', async () => {
    let rejectSave!: (error: Error) => void;
    vi.mocked(api.updateMachinePhoto).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      }),
    );
    await act(async () => root.render(<App />));
    await click(button(`Expand ${homeGym.caption}`));
    const input = container.querySelector<HTMLInputElement>('.photo-detail-caption input')!;
    await type(input, 'Hammer leg press');
    await click(button('Save name'));
    expect(button('Save name').disabled).toBe(true);
    expect(document.querySelector('.app-notification-toast')).toBeNull();

    await act(async () => rejectSave(new Error('Could not save machine name.')));
    expect(document.querySelector('.app-notification-toast')).toBeNull();
    expect(container.querySelector('.photo-detail [role="alert"]')?.textContent).toContain(
      'Could not save machine name.',
    );
    expect(input.value).toBe('Hammer leg press');
    expect(button('Save name').disabled).toBe(false);
  });

  it('does not confirm blank or unchanged machine names', async () => {
    await act(async () => root.render(<App />));
    await click(button(`Expand ${homeGym.caption}`));
    await click(button('Save name'));
    await type(container.querySelector<HTMLInputElement>('.photo-detail-caption input')!, '   ');
    await click(button('Save name'));
    expect(api.updateMachinePhoto).not.toHaveBeenCalled();
    expect(document.querySelector('.app-notification-toast')).toBeNull();
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

  it('swaps the suggested set and last date to each machine as it is pinned', async () => {
    const draft = readActiveWorkoutDraft()!;
    writeActiveWorkoutDraft({
      ...draft,
      movements: [
        {
          ...draft.movements[0],
          sets: [
            {
              ...createWorkoutSet('strength', undefined, false),
              key: 'suggested',
              reps: 8,
              weight_kg: 100,
              fromPrevious: true,
            },
          ],
        },
      ],
    });
    vi.mocked(api.listMachinePhotos).mockResolvedValue([
      usage(travelGym, 1, '2026-10-14'),
      usage(homeGym, 2, '2025-10-12'),
    ]);
    await act(async () => root.render(<App />));
    const rail = () => container.querySelectorAll<HTMLElement>('.machine-photo-rail article');
    const lastSession = () => container.querySelector('.movement-last-session')?.textContent;
    const suggestion = () => {
      const [{ key, weight_kg, reps }] = readActiveWorkoutDraft()!.movements[0].sets;
      return { key, weight_kg, reps };
    };
    expect(lastSession()).toContain('14 Oct');

    await click(button('Pin to sets', rail()[1]));
    expect(lastSession()).toContain('12 Oct');
    expect(suggestion()).toEqual({ key: 'suggested', weight_kg: 180, reps: 10 });

    await click(button('Pin to sets', rail()[0]));
    expect(lastSession()).toContain('14 Oct');
    expect(suggestion()).toEqual({ key: 'suggested', weight_kg: 140, reps: 10 });
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
    // No helper text once the last photo is gone (faa993e).
    expect(container.querySelector('.machine-photo-summary small')).toBeNull();
  });

  function pinHomeMachine() {
    const draft = readActiveWorkoutDraft()!;
    draft.movements[0].machinePhotoIds = [homeGym.id];
    writeActiveWorkoutDraft(draft);
  }

  it('has no exercise menu Settings action or machine settings editor without a pinned machine', async () => {
    await act(async () => root.render(<App />));
    const card = container.querySelector<HTMLElement>('.movement-card')!;
    const picker = card.querySelector<HTMLDetailsElement>('.machine-photo-picker')!;
    const menu = card.querySelector<HTMLDetailsElement>('.movement-overflow')!;
    expect(
      [...menu.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Settings'),
    ).toBe(false);
    await click(picker.querySelector('summary')!);
    expect(picker.open).toBe(true);
    expect(card.querySelector('.machine-settings')).toBeNull();
    expect(api.getMachineSettings).not.toHaveBeenCalled();
    expect(picker.textContent).toContain('Take photo');
    expect(picker.textContent).toContain('Choose photo');
  });

  it('stacks every pinned machine in the collapsed summary, latest pin in front', async () => {
    vi.mocked(api.listMachinePhotos).mockResolvedValue([
      usage(homeGym, 2, '2025-10-12'),
      usage(travelGym, 1, '2025-10-01'),
    ]);
    const draft = readActiveWorkoutDraft()!;
    draft.movements[0].machinePhotoIds = [travelGym.id, homeGym.id];
    writeActiveWorkoutDraft(draft);
    await act(async () => root.render(<App />));
    const summary = container.querySelector<HTMLElement>('.machine-photo-summary')!;
    expect(
      [...summary.querySelectorAll('.machine-photo-stack img')].map((img) =>
        img.getAttribute('src'),
      ),
    ).toEqual([homeGym.thumbnail_url, travelGym.thumbnail_url]);
    expect(summary.querySelector(':scope > img')).toBeNull();
    expect(summary.querySelector('small')?.textContent).toBe('Home gym Hammer press +1 more');
    expect(summary.textContent).toContain('2 pinned');
  });

  it('blocks finishing until each contributing set has a machine, and recovers assignments', async () => {
    const save = vi.spyOn(api, 'createWorkout').mockResolvedValue(recentTravel);
    vi.mocked(api.listMachinePhotos).mockResolvedValue([
      usage(homeGym, 2, null),
      usage(travelGym, 1, null),
    ]);
    const draft = readActiveWorkoutDraft()!;
    const movement = draft.movements[0];
    movement.machinePhotoIds = [homeGym.id, travelGym.id];
    // Working sets, so finishing goes straight to the confirmation rather than the warm-up review.
    const working = { ...movement.sets[0], set_type: 'normal' as const, warmup: false };
    movement.sets = [
      { ...working, completed: true },
      { ...working, key: 'set-2', completed: false, weight_kg: 100 },
    ];
    writeActiveWorkoutDraft(draft);
    await act(async () => root.render(<App />));
    const finish = () => button('Finish Leg Press');
    await click(finish());
    expect(document.querySelector('dialog[open]')?.textContent).toContain(
      'multiple machines pinned',
    );
    expect(readActiveWorkoutDraft()?.movements[0].isComplete).toBe(false);
    expect(readActiveWorkoutDraft()?.movements[0].sets[1].completed).toBe(false);
    await click(button('Choose machines'));
    await click(button('Finish workout'));
    await click(button('Finish workout', document.querySelector('dialog[open]')!));
    expect(save).not.toHaveBeenCalled();
    expect(document.querySelector('dialog[open]')?.textContent).toContain(
      'multiple machines pinned',
    );
    await click(button('Choose machines'));
    const selects = container.querySelectorAll<HTMLSelectElement>('.set-machine-select');
    for (const [index, id] of [homeGym.id, travelGym.id].entries()) {
      await act(async () => {
        selects[index].value = id;
        selects[index].dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<App />));
    expect(
      [...container.querySelectorAll<HTMLSelectElement>('.set-machine-select')].map((s) => s.value),
    ).toEqual([homeGym.id, travelGym.id]);
    await click(finish());
    expect(readActiveWorkoutDraft()?.movements[0].isComplete).toBe(true);
    expect(readActiveWorkoutDraft()?.movements[0].sets.every((set) => set.completed)).toBe(true);
    expect(readActiveWorkoutDraft()?.movements[0].sets.map((set) => set.machine_photo_id)).toEqual([
      homeGym.id,
      travelGym.id,
    ]);
    await click(button('Finish workout'));
    await click(button('Finish workout', document.querySelector('dialog[open]')!));
    expect(save).toHaveBeenCalled();
    expect(save.mock.calls[0][0].movements[0].sets.map((set) => set.machine_photo_id)).toEqual([
      homeGym.id,
      travelGym.id,
    ]);
  });

  it('reopens a finished exercise when adding a second pin and clears assignments on unpin', async () => {
    vi.mocked(api.listMachinePhotos).mockResolvedValue([
      usage(homeGym, 2, null),
      usage(travelGym, 1, null),
    ]);
    pinHomeMachine();
    const draft = readActiveWorkoutDraft()!;
    draft.movements[0].sets[0].completed = true;
    draft.movements[0].isComplete = true;
    writeActiveWorkoutDraft(draft);
    await act(async () => root.render(<App />));
    await click(container.querySelector<HTMLElement>('.movement-card > header')!);
    const picker = container.querySelector<HTMLElement>('.machine-photo-picker')!;
    await click(button('Pin to sets', picker.querySelectorAll('article')[1]));
    expect(readActiveWorkoutDraft()?.movements[0].isComplete).toBe(false);
    await click(button('Finish Leg Press'));
    expect(document.querySelector('dialog[open]')?.textContent).toContain(
      'multiple machines pinned',
    );
    await click(button('Choose machines'));
    const select = container.querySelector<HTMLSelectElement>('.set-machine-select')!;
    await act(async () => {
      select.value = travelGym.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click(button('✓ Pinned', picker.querySelectorAll('article')[1]));
    expect(readActiveWorkoutDraft()?.movements[0].sets[0].machine_photo_id).toBeNull();
    expect(container.querySelector('.set-machine-select')).toBeNull();
  });

  it('records a pinned machine settings without showing an editor in the photo section', async () => {
    pinHomeMachine();
    const saved = [{ name: 'Seat', value: '5' }];
    vi.mocked(api.getMachineSettings).mockResolvedValue({ settings: saved });
    await act(async () => root.render(<App />));
    const card = container.querySelector<HTMLElement>('.movement-card')!;
    const picker = card.querySelector<HTMLDetailsElement>('.machine-photo-picker')!;
    expect(api.getMachineSettings).toHaveBeenCalledWith(legPress.id, homeGym.id);
    expect(readActiveWorkoutDraft()?.movements[0].machineSettings).toEqual(saved);
    await click(picker.querySelector('summary')!);
    expect(picker.open).toBe(true);
    expect(card.querySelector('.machine-settings')).toBeNull();
  });

  it('keeps the muscle credits popup focused on credits even when machine settings are saved', async () => {
    pinHomeMachine();
    vi.mocked(api.getMachineSettings).mockResolvedValue({
      settings: [
        { name: 'Seat', value: '5' },
        { name: 'Backrest', value: '2' },
      ],
    });
    await act(async () => root.render(<App />));
    await click(button(`Muscle set credits for ${legPress.name}`));
    const dialog = document.querySelector<HTMLDialogElement>('.exercise-muscle-dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).not.toContain('For each completed working set');
    expect(dialog.textContent).not.toContain('These are estimates');
    expect(dialog.textContent).not.toContain('Each listed muscle');
    expect(dialog.textContent).not.toContain('Settings');
    expect(dialog.querySelector('dl')).toBeNull();
    expect(dialog.querySelector('[aria-label="Edit machine settings"]')).toBeNull();
    expect(dialog.querySelector('[aria-label="Add machine settings"]')).toBeNull();
    expect(container.querySelector('.machine-settings')).toBeNull();
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
      [],
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

  it('saves custom numeric settings with a new machine and closes its form', async () => {
    vi.mocked(api.uploadMachinePhoto).mockResolvedValue(photo('new-cybex', 'Cybex'));
    await act(async () => root.render(<App />));
    const { picker, file } = await stageNewPhoto();
    const form = picker.querySelector<HTMLElement>('.photo-inline-editor')!;
    await type(form.querySelector<HTMLInputElement>('[aria-label="Machine name"]')!, 'Cybex');
    await type(form.querySelector<HTMLInputElement>('[aria-label="Setting 1 name"]')!, 'Seat');
    await type(form.querySelector<HTMLInputElement>('[aria-label="Seat value"]')!, '5');
    await click(button('+ Add', form));
    await type(form.querySelector<HTMLInputElement>('[aria-label="Setting 2 name"]')!, 'Backrest');
    await type(form.querySelector<HTMLInputElement>('[aria-label="Backrest value"]')!, '2');
    await click(button('Save and pin', form));
    const settings = [
      { name: 'Seat', value: '5' },
      { name: 'Backrest', value: '2' },
    ];
    expect(api.uploadMachinePhoto).toHaveBeenCalledWith(legPress.id, file, 'Cybex', settings);
    expect(picker.querySelector('.photo-inline-editor')).toBeNull();
    expect(readActiveWorkoutDraft()?.movements[0].machineSettings).toEqual(settings);
    expect(readActiveWorkoutDraft()?.movements[0].machinePhotoIds).toEqual(['new-cybex']);
    expect(picker.querySelector('.machine-settings')).toBeNull();
    expect(api.getMachineSettings).not.toHaveBeenCalled();
  });

  it('retains new-machine edits on upload failure and rejects incomplete settings before uploading', async () => {
    vi.mocked(api.uploadMachinePhoto).mockRejectedValue(new Error('Photo storage is full.'));
    await act(async () => root.render(<App />));
    const { picker } = await stageNewPhoto();
    const form = picker.querySelector<HTMLElement>('.photo-inline-editor')!;
    await type(form.querySelector<HTMLInputElement>('[aria-label="Machine name"]')!, 'Cybex');
    await type(form.querySelector<HTMLInputElement>('[aria-label="Setting 1 name"]')!, 'Seat');
    await click(button('Save and pin', form));
    expect(form.textContent).toContain('Enter a setting name and value.');
    expect(api.uploadMachinePhoto).not.toHaveBeenCalled();
    await type(form.querySelector<HTMLInputElement>('[aria-label="Seat value"]')!, '5');
    await click(button('Save and pin', form));
    expect(form.querySelector<HTMLInputElement>('[aria-label="Seat value"]')?.value).toBe('5');
    expect(form.textContent).toContain('Photo storage is full.');
    expect(readActiveWorkoutDraft()?.movements[0].machinePhotoIds).toEqual([]);
  });

  it('loads the chosen machine settings into the workout without saving machine defaults', async () => {
    vi.mocked(api.listMachinePhotos).mockResolvedValue([
      usage(homeGym, 2, null),
      usage(travelGym, 1, null),
    ]);
    vi.mocked(api.getMachineSettings).mockImplementation(async (_exerciseId, photoId) => ({
      settings: [
        {
          name: 'Seat',
          value: photoId === homeGym.id ? '5' : photoId === travelGym.id ? '2' : '9',
        },
      ],
    }));
    await act(async () => root.render(<App />));
    expect(api.getMachineSettings).not.toHaveBeenCalled();
    expect(readActiveWorkoutDraft()?.movements[0].machineSettings).toBeUndefined();
    const picker = container.querySelector<HTMLElement>('.machine-photo-picker')!;
    await click(button('Pin to sets', picker.querySelector('article')!));
    expect(picker.querySelector('.machine-settings')).toBeNull();
    expect(readActiveWorkoutDraft()?.movements[0].machineSettings).toEqual([
      { name: 'Seat', value: '5' },
    ]);
    await click(button('Pin to sets', picker.querySelectorAll('article')[1]));
    expect(picker.querySelector('.machine-settings')).toBeNull();
    expect(readActiveWorkoutDraft()?.movements[0].machineSettings).toEqual([
      { name: 'Seat', value: '2' },
    ]);
    expect(api.saveMachineSettings).not.toHaveBeenCalled();
  });

  it('keeps restored workout settings instead of replacing them with newer machine defaults', async () => {
    const draft = readActiveWorkoutDraft()!;
    draft.movements[0].machinePhotoIds = [homeGym.id];
    draft.movements[0].machineSettings = [{ name: 'Seat', value: '3' }];
    writeActiveWorkoutDraft(draft);
    vi.mocked(api.getMachineSettings).mockResolvedValue({
      settings: [{ name: 'Seat', value: '8' }],
    });
    await act(async () => root.render(<App />));
    expect(api.getMachineSettings).not.toHaveBeenCalled();
    expect(readActiveWorkoutDraft()?.movements[0].machineSettings).toEqual([
      { name: 'Seat', value: '3' },
    ]);
  });
  it('merges selected machines without changing the active workout settings and opens every retained photo', async () => {
    const draft = readActiveWorkoutDraft()!;
    draft.movements[0].machinePhotoIds = [travelGym.id];
    draft.movements[0].machineSettings = [{ name: 'Seat', value: '3' }];
    writeActiveWorkoutDraft(draft);
    vi.mocked(api.listMachinePhotos).mockResolvedValue([
      usage(homeGym, 2, null),
      usage(travelGym, 1, null),
    ]);
    vi.mocked(api.mergeMachinePhotos).mockResolvedValue({
      ...usage(homeGym, 3, null),
      images: [homeGym, travelGym],
    });
    await act(async () => root.render(<App />));
    const picker = container.querySelector<HTMLElement>('.machine-photo-picker')!;
    await click(button('Select', picker));
    const tiles = picker.querySelectorAll<HTMLButtonElement>('.machine-merge-grid button');
    await click(tiles[0]);
    await click(tiles[1]);
    expect(readActiveWorkoutDraft()?.movements[0].machinePhotoIds).toEqual([travelGym.id]);
    await click(button('Merge 2', picker));
    await act(async () =>
      picker
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(picker.querySelectorAll('.machine-photo-rail article')).toHaveLength(1);
    expect(readActiveWorkoutDraft()?.movements[0].machinePhotoIds).toEqual([homeGym.id]);
    expect(readActiveWorkoutDraft()?.movements[0].machineSettings).toEqual([
      { name: 'Seat', value: '3' },
    ]);
    const gallery = picker.querySelector('.machine-photo-gallery')!;
    expect(gallery.querySelectorAll('button')).toHaveLength(2);
    await click(gallery.querySelectorAll('button')[1]);
    expect(picker.querySelector('.photo-detail > div > img')?.getAttribute('src')).toBe(
      travelGym.full_url,
    );
  });

  it('remaps an older draft photo ID to a merged machine while keeping its recorded settings', async () => {
    const draft = readActiveWorkoutDraft()!;
    draft.movements[0].machinePhotoIds = [travelGym.id];
    draft.movements[0].machineSettings = [{ name: 'Seat', value: '3' }];
    writeActiveWorkoutDraft(draft);
    vi.mocked(api.listMachinePhotos).mockResolvedValue([
      { ...usage(homeGym, 3, null), images: [homeGym, travelGym] },
    ]);
    await act(async () => root.render(<App />));
    expect(readActiveWorkoutDraft()?.movements[0].machinePhotoIds).toEqual([homeGym.id]);
    expect(readActiveWorkoutDraft()?.movements[0].machineSettings).toEqual([
      { name: 'Seat', value: '3' },
    ]);
    expect(api.getMachineSettings).not.toHaveBeenCalled();
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
      'Attempted',
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
    expect(historyCardTitles()).toEqual(['Legs 2026-10-14']);

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
    expect(historyCardTitles()).toEqual(['Legs 2026-10-14']);
  });

  it('pages through Sessions two calendar weeks at a time and jumps to a chosen page', async () => {
    await act(async () => root.render(<App />));
    const pages = () => container.querySelector<HTMLElement>('.history-session-pages')!;
    const status = () => pages().querySelector('.pagination-status')?.textContent;
    expect(
      [...pages().querySelectorAll('.history-week-header h2')].map((h) => h.textContent),
    ).toEqual(['12–18 Oct']);
    expect(historyCardTitles()).toEqual(['Legs 2026-10-14']);
    // Back to the week of 1 September 2025.
    expect(status()).toBe('Page 1 of 30');
    expect(button('Previous workout history page', pages()).disabled).toBe(true);

    await click(button('Next workout history page', pages()));
    expect(status()).toBe('Page 2 of 30');
    expect(historyCardTitles()).toEqual([]);
    expect(pages().querySelector('.history-page-status')?.textContent).toBe(
      'No workouts from 21 Sep to 4 Oct 2026',
    );

    await click(button('Choose a workout history page', pages()));
    const menu = pages().querySelector<HTMLElement>('.pagination-page-menu')!;
    expect(menu.querySelectorAll('button')).toHaveLength(30);
    await click(button('Go to page 27', menu));
    expect(pages().querySelector('.pagination-page-menu')).toBeNull();
    expect(status()).toBe('Page 27 of 30');
    expect(historyCardTitles()).toEqual(['Legs 2025-10-12']);
    // Cards from an earlier year show it.
    expect(container.querySelector('.history-card-copy small')?.textContent).toMatch(/12 Oct 2025/);

    await click(button('Previous workout history page', pages()));
    expect(status()).toBe('Page 26 of 30');
  });

  it('loads older months when jumping to a page before the loaded history', async () => {
    // Startup loads whole months back from today, so fix today for the older windows.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T12:00:00'));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    vi.mocked(api.dashboard).mockResolvedValue({
      recommendation: null,
      heatmap: [],
      history: {
        total_workouts: 4,
        first_workout_date: '2025-09-01',
        last_workout_date: '2026-10-14',
        has_sample_workouts: false,
      },
    } as unknown as DashboardData);
    vi.mocked(api.listWorkouts).mockResolvedValue([recentTravel]);
    const load = vi.spyOn(api, 'listOlderHistory').mockImplementation(async (start, end) => ({
      workouts: workouts.filter((item) => item.workout_date >= start && item.workout_date <= end),
      heatmap: [],
    }));
    await act(async () => root.render(<App />));
    const pages = () => container.querySelector<HTMLElement>('.history-session-pages')!;
    // The summary's first workout sets the page count before older months load.
    expect(pages().querySelector('.pagination-status')?.textContent).toBe('Page 1 of 30');

    await click(button('Choose a workout history page', pages()));
    await click(button('Go to page 27', pages()));
    // Each six-month read finishes before the next starts, until page 27's weeks are loaded.
    await act(() => vi.waitFor(() => expect(historyCardTitles()).toEqual(['Legs 2025-10-12'])));
    expect(load.mock.calls.map(([start]) => start)).toEqual(['2026-02-01', '2025-08-01']);
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
