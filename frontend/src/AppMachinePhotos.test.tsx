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
      getMachineSettings: vi.fn(),
      saveMachineSettings: vi.fn(),
      lastUsedMachinePhotos: vi.fn(),
      uploadMachinePhoto: vi.fn(),
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

  it('shows when each saved machine was last used', async () => {
    await act(async () => root.render(<App />));
    const card = container.querySelector('.machine-photo-rail article')!;
    expect(card.textContent).toContain('Home gym Hammer press');
    expect(card.querySelector('.machine-last-used')?.textContent).toMatch(/^Used .+ ago$/);
    expect(card.querySelector('.machine-last-used')?.getAttribute('title')).toBe(
      'Last used 12 Oct 2025',
    );
  });

  it('keeps settings hidden until selected from the exercise menu, without losing saved defaults', async () => {
    const saved = [{ name: 'Seat', value: '5' }];
    vi.mocked(api.getMachineSettings).mockResolvedValue({ settings: saved });
    await act(async () => root.render(<App />));
    const card = container.querySelector<HTMLElement>('.movement-card')!;
    const panel = card.querySelector<HTMLElement>('.machine-settings')!;
    const menu = card.querySelector<HTMLDetailsElement>('.movement-overflow')!;
    const toggle = button('Settings', menu);
    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
    expect(readActiveWorkoutDraft()?.movements[0].machineSettings).toEqual(saved);

    menu.open = true;
    await click(toggle);
    expect(menu.open).toBe(false);
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel.querySelector<HTMLInputElement>('input[aria-label="Seat value"]')?.value).toBe(
      '5',
    );

    await type(panel.querySelector<HTMLInputElement>('input[aria-label="Seat value"]')!, '6');
    menu.open = true;
    await click(toggle);
    expect(panel.hidden).toBe(true);
    menu.open = true;
    await click(toggle);
    expect(panel.querySelector<HTMLInputElement>('input[aria-label="Seat value"]')?.value).toBe(
      '6',
    );
    await click(button('Save', panel));
    expect(api.saveMachineSettings).toHaveBeenCalledWith(legPress.id, [
      { name: 'Seat', value: '6' },
    ]);
    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu.querySelector('summary'));
    menu.open = true;
    await click(toggle);
    expect(panel.querySelector<HTMLInputElement>('input[aria-label="Seat value"]')?.value).toBe(
      '6',
    );
    expect(api.getMachineSettings).toHaveBeenCalledTimes(1);
  });

  it('keeps settings open during a failed save and closes after a successful retry', async () => {
    vi.mocked(api.getMachineSettings).mockResolvedValue({
      settings: [{ name: 'Seat', value: '5' }],
    });
    vi.mocked(api.saveMachineSettings).mockRejectedValueOnce(new Error('offline'));
    await act(async () => root.render(<App />));
    const panel = container.querySelector<HTMLElement>('.machine-settings')!;
    const menu = container.querySelector<HTMLDetailsElement>('.movement-overflow')!;
    menu.open = true;
    await click(button('Settings', menu));
    await click(button('Save', panel));
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('[role="alert"]')?.textContent).toContain('Could not save');
    let resolveSave!: (saved: { settings: Array<{ name: string; value: string }> }) => void;
    vi.mocked(api.saveMachineSettings).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    await click(button('Save', panel));
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('fieldset')?.disabled).toBe(true);
    await act(async () => resolveSave({ settings: [{ name: 'Seat', value: '5' }] }));
    expect(panel.hidden).toBe(true);
  });

  it('opens settings from a collapsed exercise and keeps them hidden for other exercises', async () => {
    const draft = readActiveWorkoutDraft()!;
    draft.movements.push({
      ...draft.movements[0],
      key: 'second-movement',
      machineSettings: [],
    });
    writeActiveWorkoutDraft(draft);
    await act(async () => root.render(<App />));
    const cards = container.querySelectorAll<HTMLElement>('.movement-card');
    const first = cards[0];
    await click(first.querySelector<HTMLButtonElement>('.movement-expand-toggle')!);
    expect(first.classList.contains('is-collapsed')).toBe(true);
    const menu = first.querySelector<HTMLDetailsElement>('.movement-overflow')!;
    menu.open = true;
    await click(button('Settings', menu));
    expect(first.classList.contains('is-collapsed')).toBe(false);
    expect(first.querySelector<HTMLElement>('.machine-settings')?.hidden).toBe(false);
    expect(cards[1].querySelector<HTMLElement>('.machine-settings')?.hidden).toBe(true);
  });

  it('shows saved settings in the muscle credits popup and opens their editor', async () => {
    vi.mocked(api.getMachineSettings).mockResolvedValue({
      settings: [
        { name: 'Seat', value: '5' },
        { name: 'Backrest', value: '2' },
      ],
    });
    await act(async () => root.render(<App />));
    const panel = container.querySelector<HTMLElement>('.machine-settings')!;
    expect(panel.hidden).toBe(true);
    await click(button(`Muscle set credits for ${legPress.name}`));
    const dialog = document.querySelector<HTMLDialogElement>('.exercise-muscle-dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).not.toContain('For each completed working set');
    expect(dialog.textContent).not.toContain('These are estimates');
    expect(dialog.textContent).not.toContain('Each listed muscle');
    expect(dialog.querySelector('dl')?.textContent).toContain('Seat5');
    expect(dialog.querySelector('dl')?.textContent).toContain('Backrest2');
    await click(button('Edit machine settings', dialog));
    expect(document.querySelector('.exercise-muscle-dialog')).toBeNull();
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector<HTMLInputElement>('input[aria-label="Seat value"]')?.value).toBe(
      '5',
    );
  });

  it('offers Add in the muscle credits popup when no machine settings are saved', async () => {
    await act(async () => root.render(<App />));
    await click(button(`Muscle set credits for ${legPress.name}`));
    const dialog = document.querySelector<HTMLDialogElement>('.exercise-muscle-dialog')!;
    await click(button('Add machine settings', dialog));
    expect(document.querySelector('.exercise-muscle-dialog')).toBeNull();
    expect(container.querySelector<HTMLElement>('.machine-settings')?.hidden).toBe(false);
    expect(container.querySelector<HTMLInputElement>('.machine-settings input')?.placeholder).toBe(
      'Seat',
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
    await click(button('Settings'));
    const editor = picker.querySelector<HTMLElement>('.machine-settings')!;
    expect(editor.querySelector<HTMLInputElement>('[aria-label="Seat value"]')?.value).toBe('5');
    await type(editor.querySelector<HTMLInputElement>('[aria-label="Seat value"]')!, '6');
    await click(button('Save', editor));
    expect(api.saveMachineSettings).toHaveBeenCalledWith(
      legPress.id,
      [
        { name: 'Seat', value: '6' },
        { name: 'Backrest', value: '2' },
      ],
      'new-cybex',
    );
    expect(editor.hidden).toBe(true);
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

  it('loads and saves the chosen machine settings without changing exercise defaults', async () => {
    const original = [{ name: 'Seat', value: '9' }];
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
    expect(readActiveWorkoutDraft()?.movements[0].machineSettings).toEqual(original);
    const picker = container.querySelector<HTMLElement>('.machine-photo-picker')!;
    await click(button('Pin to sets', picker.querySelector('article')!));
    let editor = picker.querySelector<HTMLElement>('.machine-settings')!;
    expect(editor.hidden).toBe(false);
    expect(editor.querySelector<HTMLInputElement>('[aria-label="Seat value"]')?.value).toBe('5');
    await type(editor.querySelector<HTMLInputElement>('[aria-label="Seat value"]')!, '6');
    await click(button('Save', editor));
    expect(api.saveMachineSettings).toHaveBeenCalledWith(
      legPress.id,
      [{ name: 'Seat', value: '6' }],
      homeGym.id,
    );
    expect(editor.hidden).toBe(true);
    await click(button('Pin to sets', picker.querySelectorAll('article')[1]));
    editor = picker.querySelector<HTMLElement>('.machine-settings')!;
    expect(editor.hidden).toBe(false);
    expect(editor.querySelector<HTMLInputElement>('[aria-label="Seat value"]')?.value).toBe('2');
    expect(readActiveWorkoutDraft()?.movements[0].machineSettings).toEqual([
      { name: 'Seat', value: '2' },
    ]);
    expect(api.saveMachineSettings).toHaveBeenCalledTimes(1);
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
    await click(button('Settings'));
    expect(container.querySelector<HTMLInputElement>('[aria-label="Seat value"]')?.value).toBe('3');
  });
});

describe('filtering History by machine', () => {
  beforeEach(() => window.history.replaceState(null, '', '#history'));

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
