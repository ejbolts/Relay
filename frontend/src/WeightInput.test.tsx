// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingPreferencesContext } from './trainingPreferencesContext';
import { WeightInput } from './WeightInput';
import { weightToKg, type WeightUnit } from './weightUnits';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function Form({ initialKg, onSave }: { initialKg: number; onSave: (kg: number | null) => void }) {
  const [kg, setKg] = useState<number | null>(initialKg);
  const [unit, setUnit] = useState<WeightUnit>('lb');
  return (
    <TrainingPreferencesContext.Provider
      value={{
        preferences: {
          preferred_weight_unit: unit,
          week_start: 'monday',
          zone2_goal_minutes: 150,
          weekly_muscle_set_goal: 10,
        },
        error: null,
        applySaved: vi.fn(),
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(kg);
        }}
      >
        <WeightInput weightKg={kg} onWeightChange={setKg} aria-label={`Weight ${unit}`} />
        <button type="button" onClick={() => setUnit(unit === 'lb' ? 'kg' : 'lb')}>
          Switch units
        </button>
        <button type="submit">Save</button>
      </form>
    </TrainingPreferencesContext.Provider>
  );
}

async function enter(input: HTMLInputElement, value: string) {
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function save() {
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(),
  );
}

describe('weight entry saves canonical values', () => {
  it('shows an external weight update while focused and does not undo it on blur', async () => {
    const changed = vi.fn();
    await act(async () => root.render(<WeightInput weightKg={80} onWeightChange={changed} />));
    const input = container.querySelector('input')!;
    await act(async () => input.focus());
    await act(async () => root.render(<WeightInput weightKg={92.5} onWeightChange={changed} />));
    expect(Number(input.value)).toBe(92.5);
    expect(document.activeElement).toBe(input);
    await act(async () => input.blur());
    expect(changed).not.toHaveBeenCalled();
  });
  it('preserves precise kg when an unchanged rounded pounds field is focused and saved', async () => {
    const originalKg = 84.237123456;
    const onSave = vi.fn();
    await act(async () => root.render(<Form initialKg={originalKg} onSave={onSave} />));
    const input = container.querySelector('input')!;
    await act(async () => {
      input.focus();
      input.blur();
    });
    await save();
    expect(onSave).toHaveBeenCalledExactlyOnceWith(originalKg);
  });

  it('converts entered pounds to kg and keeps that result when preferences change mid-form', async () => {
    const onSave = vi.fn();
    await act(async () => root.render(<Form initialKg={80} onSave={onSave} />));
    const input = container.querySelector('input')!;
    await enter(input, '180.5');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[type="button"]')!.click(),
    );
    expect(input.getAttribute('aria-label')).toBe('Weight kg');
    expect(Number(input.value)).toBeCloseTo(weightToKg(180.5, 'lb'), 2);
    await act(async () => input.blur());
    await save();
    expect(onSave).toHaveBeenCalledExactlyOnceWith(weightToKg(180.5, 'lb'));
  });

  it('keeps a recorded zero distinct from clearing the field', async () => {
    const onSave = vi.fn();
    await act(async () => root.render(<Form initialKg={80} onSave={onSave} />));
    const input = container.querySelector('input')!;
    await enter(input, '0');
    await save();
    expect(onSave).toHaveBeenLastCalledWith(0);
    await enter(input, '');
    await save();
    expect(onSave).toHaveBeenLastCalledWith(null);
  });
});
