// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { BodyCompositionScreen } from './App';
import type { BodyMeasurement, BodyWeightGoal } from './types';
import { localDate } from './utils';

let root: Root;
let host: HTMLDivElement;

const measurement = (
  date: string,
  weight: number,
  bodyFat: number | null = null,
  notes: string | null = null,
): BodyMeasurement => ({
  id: date,
  measurement_date: date,
  weight_kg: weight,
  body_fat_pct: bodyFat,
  notes,
  is_sample: false,
  created_at: `${date}T07:00:00Z`,
});
const goal: BodyWeightGoal = {
  id: 'goal',
  start_date: '2026-10-01',
  target_date: '2027-01-31',
  start_weight_kg: 86,
  target_weight_kg: 80,
  active: true,
  created_at: '2026-10-01T08:00:00Z',
};
const MEASUREMENTS = [
  measurement('2026-11-18', 82.5),
  measurement('2026-11-05', 83.3, 17.4, 'Morning, fasted'),
  measurement('2026-10-29', 83.9, 17.6),
];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.spyOn(api, 'listBodyWeightGoals').mockResolvedValue([goal]);
  vi.spyOn(api, 'listBodySizes').mockResolvedValue([]);
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

async function mount(
  onSave = vi.fn().mockResolvedValue(undefined),
  onDelete = vi.fn().mockResolvedValue(undefined),
  measurements = MEASUREMENTS,
) {
  await act(async () =>
    root.render(
      <BodyCompositionScreen
        measurements={measurements}
        onSave={onSave}
        onDelete={onDelete}
        onDataChange={vi.fn().mockResolvedValue(undefined)}
      />,
    ),
  );
  return { onSave, onDelete };
}

function button(text: string, within: ParentNode = document) {
  const found = [...within.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!found) throw new Error(`No ${text} button`);
  return found;
}

function setValue(target: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(target, value);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
}

const dialog = () => document.querySelector<HTMLDialogElement>('dialog[open]')!;
const field = (label: string) =>
  [...dialog().querySelectorAll('label')]
    .find((item) => item.textContent?.startsWith(label))!
    .querySelector('input')!;
const note = () => dialog().querySelector('textarea')!;
const submit = () => dialog().querySelector<HTMLButtonElement>('button[type="submit"]')!;

describe('Log weigh-in', () => {
  it('fills in a day’s check-in so saving a new weight keeps its body fat and note', async () => {
    const { onSave } = await mount();
    await act(async () => button('Log weigh-in').click());
    expect(field('Date').value).toBe(localDate());
    expect(submit().textContent).toBe('Save check-in');

    await act(async () => setValue(field('Date'), '2026-11-05'));
    expect(field('Weight').value).toBe('83.3');
    expect(field('Body fat').value).toBe('17.4');
    expect(note().value).toBe('Morning, fasted');
    expect(submit().textContent).toBe('Update check-in');

    await act(async () => setValue(field('Weight'), '83.1'));
    await act(async () => submit().click());
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      measurement_date: '2026-11-05',
      weight_kg: 83.1,
      body_fat_pct: 17.4,
      notes: 'Morning, fasted',
    });
    expect(document.querySelector('dialog[open]')).toBeNull();
  });

  it('opens on today every time, even after a back-dated save', async () => {
    await mount();
    await act(async () => button('Log weigh-in').click());
    await act(async () => setValue(field('Date'), '2026-10-29'));
    await act(async () => submit().click());
    await act(async () => button('Log weigh-in').click());
    expect(field('Date').value).toBe(localDate());
    expect(field('Weight').value).toBe('');
    expect(field('Body fat').value).toBe('');
  });

  it('keeps a typed weight across empty days but never carries a saved day’s values', async () => {
    await mount();
    await act(async () => button('Log weigh-in').click());
    await act(async () => setValue(field('Weight'), '82.9'));
    await act(async () => setValue(field('Date'), '2026-11-01'));
    expect(field('Weight').value).toBe('82.9');
    await act(async () => setValue(field('Date'), '2026-10-29'));
    expect(field('Weight').value).toBe('83.9');
    expect(field('Body fat').value).toBe('17.6');
    await act(async () => setValue(field('Date'), '2026-11-02'));
    expect(field('Weight').value).toBe('');
    expect(field('Body fat').value).toBe('');
    expect(submit().textContent).toBe('Save check-in');
  });
});

describe('Body summary', () => {
  it('shows the latest body fat reading with its date when the latest check-in has none', async () => {
    await mount();
    const stats = host.querySelector('.body-reference-stats')!;
    const fat = stats.children[2];
    expect(fat.querySelector('strong')?.textContent).toBe('17.4%');
    expect(fat.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-05');
    expect(fat.querySelector('small')?.textContent).toBe('5 Nov');

    await act(async () =>
      root.render(
        <BodyCompositionScreen
          measurements={[measurement('2026-11-18', 82.5, 17.1), ...MEASUREMENTS.slice(1)]}
          onSave={vi.fn()}
          onDelete={vi.fn()}
          onDataChange={vi.fn()}
        />,
      ),
    );
    expect(fat.querySelector('strong')?.textContent).toBe('17.1%');
    expect(fat.querySelector('small')).toBeNull();
  });
});

describe('Editing the body-weight goal', () => {
  it('opens the active goal from its tile and saves changes to the same goal', async () => {
    const update = vi
      .spyOn(api, 'updateBodyWeightGoal')
      .mockImplementation(async (id, payload) => ({ ...goal, ...payload, id }));
    const create = vi.spyOn(api, 'createBodyWeightGoal');
    await mount();
    const tile = host.querySelector<HTMLButtonElement>('.body-goal-tile > button')!;
    expect(tile.textContent).toBe('January goal80 kg');
    await act(async () => tile.click());

    expect(dialog().querySelector('h2')?.textContent).toBe('Edit goal');
    expect(dialog().querySelector('[aria-label="Goal"]')).toBeNull();
    expect(field('Target (kg)').value).toBe('80');
    expect(field('Target date').value).toBe('2027-01-31');
    expect(submit().textContent).toBe('Save goal');

    await act(async () => setValue(field('Target (kg)'), '79'));
    await act(async () => setValue(field('Target date'), '2027-02-28'));
    await act(async () => submit().click());
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledExactlyOnceWith('goal', {
      start_date: '2026-10-01',
      target_date: '2027-02-28',
      start_weight_kg: 86,
      target_weight_kg: 79,
      active: true,
    });
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(host.querySelector('.body-goal-tile strong')?.textContent).toBe('79 kg');

    // New goal still opens an empty form.
    await act(async () => button('New goal').click());
    expect(dialog().querySelector('h2')?.textContent).toBe('Add bodyweight goal');
    expect(field('Target (kg)').value).toBe('');
  });

  it('keeps an edited loss goal below where it started', async () => {
    const update = vi.spyOn(api, 'updateBodyWeightGoal');
    await mount();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.body-goal-tile > button')!.click(),
    );
    await act(async () => setValue(field('Target (kg)'), '88'));
    await act(async () => submit().click());
    expect(dialog().querySelector('.inline-error')?.textContent).toBe(
      'For a weight-loss goal, choose a target below its starting 86 kg.',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('removes the goal from its dialog with the Undo popup', async () => {
    await mount();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.body-goal-tile > button')!.click(),
    );
    const remove = button('Remove goal', dialog());
    await act(async () => remove.click());
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(document.querySelector('.toast')?.textContent).toContain('Goal removed');
    expect(host.querySelector('.body-goal-tile')).toBeNull();
  });
});

describe('Check-in row menu', () => {
  const menus = () => [...host.querySelectorAll<HTMLDetailsElement>('.body-row-menu')];
  async function toggle(menu: HTMLDetailsElement) {
    await act(async () => {
      menu.open = !menu.open;
      menu.dispatchEvent(new Event('toggle'));
    });
  }

  it('closes when Edit is chosen, so the edit form is not covered', async () => {
    await mount();
    const [first] = menus();
    await toggle(first);
    expect(first.open).toBe(true);
    await act(async () => button('Edit', first).click());
    expect(first.open).toBe(false);
    expect(host.querySelector('.body-edit-form')).not.toBeNull();
  });

  it('closes on a tap elsewhere or Escape, so only one is open at a time', async () => {
    await mount();
    const [first, second] = menus();
    await toggle(first);
    await act(async () =>
      second.querySelector('summary')!.dispatchEvent(new Event('pointerdown', { bubbles: true })),
    );
    expect(first.open).toBe(false);
    await toggle(second);
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(second.open).toBe(false);
  });

  it('deletes after confirming, with Delete in the danger style', async () => {
    const { onDelete } = await mount();
    const [first] = menus();
    await toggle(first);
    const remove = button('Delete', first);
    expect(remove.classList.contains('body-row-menu-delete')).toBe(true);
    await act(async () => remove.click());
    expect(onDelete).not.toHaveBeenCalled();
    await act(async () => button('Delete check-in', first).click());
    expect(onDelete).toHaveBeenCalledExactlyOnceWith('2026-11-18');
    expect(first.open).toBe(false);
  });
});
