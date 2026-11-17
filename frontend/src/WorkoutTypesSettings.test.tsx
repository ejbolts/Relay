// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { WorkoutTypesSettings } from './WorkoutTypesSettings';
import type { WorkoutType } from './types';

const upper: WorkoutType = {
  id: 'upper',
  name: 'Upper body',
  color: '#8b5cf6',
  is_custom: false,
  archived: false,
};
const arms: WorkoutType = {
  id: 'custom-arms',
  name: 'Arms',
  color: '#22c55e',
  is_custom: true,
  archived: false,
};
let root: Root;
let container: HTMLDivElement;
const changed = vi.fn();

function Harness({ initial = [upper] }: { initial?: WorkoutType[] }) {
  const [types, setTypes] = useState(initial);
  return (
    <WorkoutTypesSettings
      types={types}
      onTypesChange={(next) => {
        changed(next);
        setTypes(next);
      }}
    />
  );
}

function button(label: string) {
  const found = [...container.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === label || item.textContent === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

async function setInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function enterName(value: string) {
  await setInput(container.querySelector<HTMLInputElement>('input[type="text"]')!, value);
}

async function click(label: string) {
  await act(async () => button(label).click());
}

async function submit() {
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(api, 'createWorkoutType').mockImplementation(async ({ name, color }) => ({
    id: `custom-${name.toLowerCase()}`,
    name,
    color,
    is_custom: true,
    archived: false,
  }));
  vi.spyOn(api, 'updateWorkoutType').mockImplementation(async (id, payload) => ({
    ...(id === upper.id ? upper : arms),
    ...payload,
  }));
  vi.spyOn(api, 'deleteWorkoutType').mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  changed.mockClear();
});

describe('Workout type settings', () => {
  it('can fold the editor without discarding an unfinished workout type', async () => {
    await act(async () =>
      root.render(<WorkoutTypesSettings collapsible types={[upper]} onTypesChange={changed} />),
    );
    const toggle = container.querySelector<HTMLButtonElement>('.collapsible-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await act(async () => toggle.click());
    await enterName('Recovery');
    await act(async () => toggle.click());
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('Recovery');
    expect(api.createWorkoutType).not.toHaveBeenCalled();
  });
  it('adds Arms, Legs, Limbs and Torso as their own types without replacing the existing catalog', async () => {
    await act(async () => root.render(<Harness />));
    for (const name of ['Arms', 'Legs', 'Limbs', 'Torso']) {
      await enterName(`  ${name}  `);
      await click('Add type');
      expect(api.createWorkoutType).toHaveBeenLastCalledWith({ name, color: '#a855f7' });
      expect(container.querySelector('input[type="text"]')!.getAttribute('value')).toBe('');
    }
    const latest = changed.mock.calls.at(-1)![0] as WorkoutType[];
    expect(latest.map((type) => type.name)).toEqual([
      'Upper body',
      'Arms',
      'Legs',
      'Limbs',
      'Torso',
    ]);
    expect(container.querySelector('[aria-label="Active workout types"]')!.textContent).toContain(
      'Torso',
    );
  });

  it('blocks duplicate names including removed types and explains how to restore them', async () => {
    await act(async () => root.render(<Harness initial={[upper, { ...arms, archived: true }]} />));
    await enterName(' UPPER BODY ');
    await submit();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('already exists');
    await enterName(' arms ');
    await submit();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('Restore it below');
    expect(api.createWorkoutType).not.toHaveBeenCalled();
    expect(container.querySelector('details')!.open).toBe(false);
  });

  it('rejects blank and overlong names before making a request', async () => {
    await act(async () => root.render(<Harness />));
    for (const value of ['   ', 'x'.repeat(41)]) {
      await enterName(value);
      await submit();
      expect(container.querySelector('[role="alert"]')!.textContent).toContain('1–40 characters');
    }
    expect(api.createWorkoutType).not.toHaveBeenCalled();
  });

  it('keeps the name and colour after a failed add and allows retry', async () => {
    vi.mocked(api.createWorkoutType).mockRejectedValueOnce(
      new Error('Could not connect. Try again.'),
    );
    await act(async () => root.render(<Harness />));
    await enterName('Arms');
    await setInput(
      container.querySelector<HTMLInputElement>('.workout-types-new-color input')!,
      '#ef4444',
    );
    await click('Add type');
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('Could not connect');
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('Arms');
    expect(container.querySelector<HTMLInputElement>('.workout-types-new-color input')!.value).toBe(
      '#ef4444',
    );
    expect(changed).not.toHaveBeenCalled();
    await click('Add type');
    expect(api.createWorkoutType).toHaveBeenLastCalledWith({ name: 'Arms', color: '#ef4444' });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Arms added.');
  });

  it('removes and restores a predefined type without discarding it', async () => {
    await act(async () => root.render(<Harness initial={[upper, arms]} />));
    await click('Remove Upper body workout type');
    expect(api.deleteWorkoutType).toHaveBeenCalledWith('upper');
    expect(
      container.querySelector('[aria-label="Active workout types"]')!.textContent,
    ).not.toContain('Upper body');
    expect(container.querySelector('[aria-label="Removed workout types"]')!.textContent).toContain(
      'Upper body',
    );
    expect(changed.mock.calls.at(-1)![0]).toEqual([{ ...upper, archived: true }, arms]);
    expect(container.textContent).toContain('Saved workouts are unchanged');
    await click('Restore Upper body workout type');
    expect(api.updateWorkoutType).toHaveBeenCalledWith('upper', { archived: false });
    expect(container.querySelector('[aria-label="Active workout types"]')!.textContent).toContain(
      'Upper body',
    );
    expect(container.querySelector('details')).toBeNull();
  });

  it('keeps a custom type in place after failed removal and preserves removed types after failed restore', async () => {
    vi.mocked(api.deleteWorkoutType).mockRejectedValueOnce(new Error('Removal failed.'));
    vi.mocked(api.updateWorkoutType).mockRejectedValueOnce(new Error('Restore failed.'));
    await act(async () => root.render(<Harness initial={[upper, arms]} />));
    await click('Remove Arms workout type');
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('Removal failed.');
    expect(container.querySelector('[aria-label="Active workout types"]')!.textContent).toContain(
      'Arms',
    );
    expect(changed).not.toHaveBeenCalled();
    await click('Remove Arms workout type');
    await click('Restore Arms workout type');
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('Restore failed.');
    expect(container.querySelector('[aria-label="Removed workout types"]')!.textContent).toContain(
      'Arms',
    );
    await click('Restore Arms workout type');
    expect(container.querySelector('[aria-label="Active workout types"]')!.textContent).toContain(
      'Arms',
    );
  });

  it('retains failed colour drafts when the catalog changes, then saves just the selected colour', async () => {
    vi.mocked(api.updateWorkoutType).mockRejectedValueOnce(new Error('Colour save failed.'));
    await act(async () => root.render(<Harness initial={[upper, arms]} />));
    await setInput(
      container.querySelector<HTMLInputElement>('[aria-label="Upper body workout colour"]')!,
      '#ee8844',
    );
    await click('Save Upper body colour');
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('Colour save failed.');
    expect(changed).not.toHaveBeenCalled();
    await click('Remove Arms workout type');
    expect(
      container.querySelector<HTMLInputElement>('[aria-label="Upper body workout colour"]')!.value,
    ).toBe('#ee8844');
    await click('Save Upper body colour');
    expect(api.updateWorkoutType).toHaveBeenLastCalledWith('upper', { color: '#ee8844' });
    expect(changed.mock.calls.at(-1)![0]).toEqual([
      { ...upper, color: '#ee8844' },
      { ...arms, archived: true },
    ]);
    expect(container.querySelector('[aria-label="Save Upper body colour"]')).toBeNull();
  });

  it('allows changing a custom type colour and preserves it when the type is removed and restored', async () => {
    vi.mocked(api.updateWorkoutType).mockImplementation(async (id, payload) => ({
      ...(id === upper.id ? upper : arms),
      color: '#f97316',
      ...payload,
    }));
    await act(async () => root.render(<Harness initial={[upper, arms]} />));
    await setInput(
      container.querySelector<HTMLInputElement>('[aria-label="Arms workout colour"]')!,
      '#f97316',
    );
    await click('Save Arms colour');
    await click('Remove Arms workout type');
    expect(changed.mock.calls.at(-1)![0][1]).toMatchObject({ color: '#f97316', archived: true });
    await click('Restore Arms workout type');
    expect(
      container.querySelector<HTMLInputElement>('[aria-label="Arms workout colour"]')!.value,
    ).toBe('#f97316');
  });

  it('blocks repeated submissions and conflicting changes while a save is in flight', async () => {
    let finish!: (type: WorkoutType) => void;
    vi.mocked(api.createWorkoutType).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => root.render(<Harness />));
    await enterName('Arms');
    await submit();
    await submit();
    expect(api.createWorkoutType).toHaveBeenCalledTimes(1);
    expect(button('Remove Upper body workout type').disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')!.disabled).toBe(true);
    await act(async () => finish(arms));
    expect(button('Remove Upper body workout type').disabled).toBe(false);
  });

  it('shows a catalog error with retry and prevents saving against an unavailable catalog', async () => {
    const retry = vi.fn();
    await act(async () =>
      root.render(
        <WorkoutTypesSettings
          types={[]}
          onTypesChange={changed}
          error="Could not load workout types."
          onRetry={retry}
        />,
      ),
    );
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('Could not load');
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')!.disabled).toBe(true);
    await click('Try again');
    expect(retry).toHaveBeenCalledTimes(1);
    expect(api.createWorkoutType).not.toHaveBeenCalled();
  });
});
