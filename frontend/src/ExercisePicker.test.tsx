// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExercisePicker } from './App';
import { api } from './api';
import { formatLastDone } from './exerciseLastDone';
import type { Exercise, MachinePhotoUsage } from './types';
import { localDate } from './utils';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    api: { ...original.api, listAllMachinePhotos: vi.fn(), uploadMachinePhoto: vi.fn() },
  };
});
vi.mock('./photoOptimise', () => ({ optimisePhoto: vi.fn(async (file: File) => file) }));

const cable: Exercise = {
  id: 'cable',
  name: 'Cable Biceps Curl',
  equipment: 'Cable',
  muscle_group: 'Biceps',
  category: 'pull',
  kind: 'strength',
  is_custom: false,
  is_favorite: true,
  muscle_contributions: [],
};
const exercises: Exercise[] = [
  cable,
  {
    ...cable,
    id: 'db',
    name: 'Dumbbell Curl',
    equipment: 'Dumbbell',
    is_favorite: false,
    is_custom: true,
  },
  { ...cable, id: 'single', name: 'Single-Arm Cable Biceps Curl', is_favorite: false },
  {
    ...cable,
    id: 'push',
    name: 'Cable Triceps Pushdown',
    category: 'push',
    muscle_group: 'Triceps',
  },
];
function machine(id: string, caption: string, lastUsed: string | null): MachinePhotoUsage {
  return {
    id,
    exercise_id: cable.id,
    exercise_name: cable.name,
    caption,
    thumbnail_url: `/api/machine-photos/${id}/image?variant=thumbnail`,
    full_url: `/api/machine-photos/${id}/image?variant=full`,
    width: 64,
    height: 48,
    created_at: '2026-01-01T00:00:00Z',
    workout_count: lastUsed ? 1 : 0,
    last_used_date: lastUsed,
  };
}
// Most recently used first, as the API returns them.
const cableMachines = [
  machine('matrix', 'Matrix cable stack', '2026-10-20'),
  machine('hammer', 'Hammer dual cable', '2026-09-01'),
  machine('spare', 'Spare cable', null),
];

let root: Root, host: HTMLDivElement;
const onChoose = vi.fn();

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  URL.createObjectURL = vi.fn(() => 'blob:machine-preview');
  URL.revokeObjectURL = vi.fn();
  vi.mocked(api.listAllMachinePhotos).mockReset().mockResolvedValue(cableMachines);
  vi.mocked(api.uploadMachinePhoto).mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  onChoose.mockReset();
  await act(async () =>
    root.render(
      <ExercisePicker
        exercises={exercises}
        excludedIds={['single']}
        recentExerciseIds={['cable', 'db']}
        onChoose={onChoose}
        onClose={vi.fn()}
        onFavoriteChange={vi.fn()}
        onCreateExercise={vi.fn()}
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function setValue(selector: string, value: string) {
  const field = document.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
  await act(async () => {
    const prototype =
      field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(
      new Event(field instanceof HTMLInputElement ? 'input' : 'change', { bubbles: true }),
    );
  });
}
const names = () =>
  [...document.querySelectorAll('.exercise-option-copy > strong')].map((item) => item.textContent);

it('combines equipment, category, favourites and search instead of bypassing filters', async () => {
  await setValue('[aria-label="Equipment"]', 'Cable');
  await setValue('[aria-label="Body part"]', 'pull');
  await setValue('[aria-label="Exercise category"]', 'favorites');
  await setValue('.exercise-search', 'bicep curl');
  expect(names()).toEqual(['Cable Biceps Curl']);
  await setValue('[aria-label="Equipment"]', 'Dumbbell');
  expect(names()).toEqual([]);
  expect(document.querySelector('.muted-empty')?.textContent).toContain('No exercises match');
  await setValue('[aria-label="Exercise category"]', 'recent');
  expect(names()).toEqual(['Dumbbell Curl']);
  await setValue('[aria-label="Body part"]', 'push');
  expect(names()).toEqual([]);
});

it('retains a chosen variant across filter changes and submits its own ID', async () => {
  await setValue('.exercise-search', 'db bicep curl');
  expect(names()).toEqual(['Dumbbell Curl']);
  await act(async () =>
    document.querySelector<HTMLButtonElement>('.exercise-option-select')!.click(),
  );
  await setValue('[aria-label="Equipment"]', 'Cable');
  await setValue('.exercise-search', '');
  expect(names()).not.toContain('Single-Arm Cable Biceps Curl');
  const add = document.querySelector<HTMLButtonElement>('.add-selected-button')!;
  await act(async () => add.click());
  expect(onChoose).toHaveBeenCalledWith([exercises[1]], {});
});

it('leaves hidden exercises out of every list, including search', async () => {
  const shown = names();
  const hiddenName = shown[0]!;
  await act(async () =>
    root.render(
      <ExercisePicker
        exercises={exercises.map((item) =>
          item.name === hiddenName ? { ...item, hidden: true } : item,
        )}
        excludedIds={['single']}
        recentExerciseIds={['cable', 'db']}
        onChoose={onChoose}
        onClose={vi.fn()}
        onFavoriteChange={vi.fn()}
        onCreateExercise={vi.fn()}
      />,
    ),
  );
  expect(names()).not.toContain(hiddenName);
  await setValue('.exercise-search', hiddenName);
  expect(names()).not.toContain(hiddenName);
});

it('filters custom exercises independently of category, equipment and search', async () => {
  const custom = document.querySelector<HTMLButtonElement>('[aria-label="Custom exercises"]')!;
  await act(async () => custom.click());
  expect(names()).toEqual(['Dumbbell Curl']);
  await setValue('[aria-label="Equipment"]', 'Dumbbell');
  await setValue('[aria-label="Body part"]', 'pull');
  await setValue('.exercise-search', 'bicep curl');
  expect(names()).toEqual(['Dumbbell Curl']);
  await setValue('[aria-label="Exercise category"]', 'favorites');
  expect(names()).toEqual([]);
  await setValue('[aria-label="Exercise category"]', 'all');
  await setValue('[aria-label="Equipment"]', 'Cable');
  expect(names()).toEqual([]);
  await act(async () => custom.click());
  expect(custom.getAttribute('aria-pressed')).toBe('false');
  expect(names()).toEqual(['Cable Biceps Curl']);
});

it('shows when each exercise was last done and skips unlogged ones', async () => {
  const today = localDate();
  await act(async () =>
    root.render(
      <ExercisePicker
        exercises={exercises}
        excludedIds={['single']}
        recentExerciseIds={['cable', 'db']}
        lastDoneDates={
          new Map([
            ['cable', today],
            ['db', '2020-01-15'],
          ])
        }
        onChoose={onChoose}
        onClose={vi.fn()}
        onFavoriteChange={vi.fn()}
        onCreateExercise={vi.fn()}
      />,
    ),
  );
  const lastDone = (id: string) =>
    document.querySelector(`[data-exercise-id="${id}"] .exercise-option-last-done`);
  expect(lastDone('cable')?.textContent).toBe(`Last done ${formatLastDone(today, today)}`);
  expect(lastDone('db')?.textContent).toBe(`Last done ${formatLastDone('2020-01-15', today)}`);
  expect(lastDone('push')).toBeNull();
});

describe('choosing a machine beneath an exercise', () => {
  const row = (id: string) => document.querySelector<HTMLElement>(`[data-exercise-id="${id}"]`)!;
  const card = (caption: string) =>
    [...row('cable').querySelectorAll<HTMLButtonElement>('.exercise-machine-card')].find(
      (item) => item.querySelector('strong')?.textContent === caption,
    )!;
  const pressed = () =>
    [...row('cable').querySelectorAll('.exercise-machine-card[aria-pressed="true"] strong')].map(
      (item) => item.textContent,
    );
  const click = (target: HTMLElement) => act(async () => target.click());
  const select = (id: string) =>
    click(row(id).querySelector<HTMLButtonElement>('.exercise-option-select')!);
  const summary = () => row('cable').querySelector('.exercise-option-machine')?.textContent;
  async function stagePhoto(file: File) {
    const input = row('cable').querySelector<HTMLInputElement>('.exercise-machine-add input')!;
    await act(async () => {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return input;
  }

  it('preselects the last-used machine and returns to the baseline exercise when it is tapped again', async () => {
    expect(row('db').querySelector('.exercise-machine-toggle')).toBeNull();
    expect(row('cable').classList.contains('machines-open')).toBe(false);
    const accordion = row('cable').querySelector('.exercise-machine-accordion')!;
    expect(accordion.hasAttribute('inert')).toBe(true);

    await select('cable');
    expect(row('cable').classList.contains('machines-open')).toBe(true);
    expect(accordion.hasAttribute('inert')).toBe(false);
    expect(
      row('cable').querySelector('.exercise-machine-toggle')?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(pressed()).toEqual(['Matrix cable stack']);
    expect(summary()).toBe('Matrix cable stack');
    expect(card('Matrix cable stack').querySelector('.exercise-machine-badge')?.textContent).toBe(
      'Last used',
    );
    expect(card('Spare cable').textContent).toContain('Not used yet');

    await click(card('Matrix cable stack'));
    expect(pressed()).toEqual([]);
    expect(summary()).toBe('Baseline exercise');
    expect(
      row('cable').querySelector('.exercise-option-select')?.getAttribute('aria-pressed'),
    ).toBe('true');

    await click(document.querySelector<HTMLButtonElement>('.add-selected-button')!);
    expect(onChoose).toHaveBeenCalledWith([cable], { cable: null });
  });

  it('switches machines, and picks an exercise from a strip opened without selecting it', async () => {
    const toggle = row('cable').querySelector<HTMLButtonElement>('.exercise-machine-toggle')!;
    expect(toggle.getAttribute('aria-label')).toBe('Show machines for Cable Biceps Curl');
    await click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(pressed()).toEqual([]);

    await click(card('Hammer dual cable'));
    expect(
      row('cable').querySelector('.exercise-option-select')?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(pressed()).toEqual(['Hammer dual cable']);
    await click(card('Spare cable'));
    expect(pressed()).toEqual(['Spare cable']);

    await select('db');
    await click(document.querySelector<HTMLButtonElement>('.add-selected-button')!);
    expect(onChoose).toHaveBeenCalledWith([cable, exercises[1]], { cable: 'spare' });

    // Removing the exercise closes its machines and forgets the choice.
    await select('cable');
    expect(row('cable').classList.contains('machines-open')).toBe(false);
    await select('cable');
    expect(pressed()).toEqual(['Matrix cable stack']);
  });

  it('names and saves a new machine from the strip, then selects it', async () => {
    vi.mocked(api.uploadMachinePhoto).mockResolvedValue(machine('cybex', 'Cybex crossover', null));
    await select('cable');
    const file = new File(['machine'], 'cybex.jpg', { type: 'image/jpeg' });
    const input = await stagePhoto(file);
    expect(input.getAttribute('aria-label')).toBe('Add machine for Cable Biceps Curl');
    const form = document.querySelector<HTMLFormElement>('.exercise-machine-add-form')!;
    await act(async () => form.requestSubmit());
    expect(form.querySelector('[role="alert"]')?.textContent).toBe('Enter the machine name.');
    expect(api.uploadMachinePhoto).not.toHaveBeenCalled();

    await setValue('.exercise-machine-add-form input', '  Cybex crossover ');
    expect(form.querySelector('[role="alert"]')).toBeNull();
    await act(async () => form.requestSubmit());
    expect(api.uploadMachinePhoto).toHaveBeenCalledWith('cable', file, 'Cybex crossover');
    expect(document.querySelector('.exercise-machine-add-form')).toBeNull();
    expect(pressed()).toEqual(['Cybex crossover']);
    expect(summary()).toBe('Cybex crossover');

    await click(document.querySelector<HTMLButtonElement>('.add-selected-button')!);
    expect(onChoose).toHaveBeenCalledWith([cable], { cable: 'cybex' });
  });

  it('keeps the staged machine and reports a failed upload', async () => {
    vi.mocked(api.uploadMachinePhoto).mockRejectedValue(new Error('Upload failed.'));
    await select('cable');
    await stagePhoto(new File(['machine'], 'cybex.jpg', { type: 'image/jpeg' }));
    await setValue('.exercise-machine-add-form input', 'Cybex crossover');
    await act(async () =>
      document.querySelector<HTMLFormElement>('.exercise-machine-add-form')!.requestSubmit(),
    );
    expect(document.querySelector('.exercise-machine-add-form [role="alert"]')?.textContent).toBe(
      'Upload failed.',
    );
    expect(
      document.querySelector<HTMLInputElement>('.exercise-machine-add-form input')?.value,
    ).toBe('Cybex crossover');
    expect(pressed()).toEqual(['Matrix cable stack']);
  });
});
