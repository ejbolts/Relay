// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlateCalculatorDialog } from './PlateCalculator';
import { TrainingPreferencesContext } from './trainingPreferencesContext';
import type { WeightUnit } from './weightUnits';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function open(
  unit: WeightUnit,
  weightKg: number | null,
  barType: 'olympic' | 'ez' | 'trap' = 'olympic',
) {
  const onUse = vi.fn();
  const onClose = vi.fn();
  await act(async () =>
    root.render(
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
        <PlateCalculatorDialog
          exercise={{ id: 'bench', name: 'Barbell Bench Press' }}
          barType={barType}
          setLabel="Set 2"
          weightKg={weightKg}
          onUse={onUse}
          onClose={onClose}
        />
      </TrainingPreferencesContext.Provider>,
    ),
  );
  return { onUse, onClose };
}

const dialog = () => document.querySelector('dialog.plate-calculator')!;
const text = () => dialog().textContent ?? '';
const button = (label: string | RegExp) =>
  [...dialog().querySelectorAll<HTMLElement>('button, [role="button"]')].find((item) => {
    const name = item.getAttribute('aria-label') ?? item.textContent ?? '';
    return typeof label === 'string' ? name === label : label.test(name);
  })!;
const click = (label: string | RegExp) =>
  act(async () => {
    button(label).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

describe('plate calculator', () => {
  it("loads the set's kg weight onto an Olympic bar and draws each side", async () => {
    await open('kg', 100);
    expect(text()).toContain('Set 2 · Barbell Bench Press');
    expect(text()).toContain('20 kg bar + 80 kg plates');
    expect(text()).toContain('✓ Loads exactly');
    expect(dialog().querySelector('.plate-calculator-side')?.textContent).toBe(
      'Each side: 25 + 15 kg',
    );
    expect(dialog().querySelector('svg')?.getAttribute('aria-label')).toBe(
      'Olympic bar with 25, 15 kg on each side',
    );
    // Two plates on each side of the bar.
    expect(dialog().querySelectorAll('.plate-calculator-plate')).toHaveLength(4);
  });

  it('steps by a pair of the lightest plates and explains weights it cannot load', async () => {
    await open('kg', 67.5);
    expect(text()).toContain('67.5 kg needs 1.25 kg more per side');
    expect(button(/^Use /).textContent).toBe('Use 65 kg');
    await click('5 kg more');
    expect(button(/^Use /).textContent).toBe('Use 70 kg');
    expect(text()).toContain('✓ Loads exactly');
  });

  it('adds and removes pairs of plates to build a weight', async () => {
    const { onUse, onClose } = await open('kg', null);
    expect(text()).toContain('Just the bar');
    await click('Add a pair of 20 kg plates');
    await click('Add a pair of 2.5 kg plates');
    await click(/^Add a pair of 20 kg plates/);
    expect(dialog().querySelector('.plate-calculator-side')?.textContent).toBe(
      'Each side: 20 + 20 + 2.5 kg',
    );
    await click('Remove a pair of 2.5 kg plates');
    await click(/^Use /);
    expect(onUse).toHaveBeenCalledWith(100);
    expect(onClose).toHaveBeenCalled();
  });

  it('uses pound plates and the 45 lb bar for pound users, saving the weight in kg', async () => {
    const { onUse } = await open('lb', 225 / 2.2046226218);
    expect(text()).toContain('45 lb bar + 180 lb plates');
    expect(dialog().querySelector('.plate-calculator-side')?.textContent).toBe(
      'Each side: 45 + 45 lb',
    );
    expect(
      [...dialog().querySelectorAll('.plate-calculator-plates b')].map((item) => item.textContent),
    ).toEqual(['45', '35', '25', '10', '5', '2.5']);
    await click('5 lb more');
    await click(/^Use /);
    expect(onUse.mock.calls[0][0]).toBeCloseTo(230 / 2.2046226218, 6);
  });

  it('switches between Olympic, EZ and trap bars and remembers the choice', async () => {
    await open('kg', 60, 'ez');
    expect(button('EZ bar').getAttribute('aria-pressed')).toBe('true');
    expect(text()).toContain('10 kg bar + 50 kg plates');
    await click('Trap bar');
    expect(text()).toContain('25 kg bar');
    expect(button(/^Use /).textContent).toBe('Use 60 kg');
    const input = dialog().querySelector<HTMLInputElement>('.plate-calculator-bar-weight input')!;
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(input, '30');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(text()).toContain('30 kg bar + 30 kg plates');
    expect(JSON.parse(localStorage.getItem('gym-plate-calculator-bars')!)).toEqual({
      bench: { type: 'trap', weight: 30, unit: 'kg' },
    });
  });

  it('says when the weight is lighter than the bar', async () => {
    await open('kg', 15);
    expect(text()).toContain('15 kg is lighter than the 20 kg bar');
    expect(button(/^Use /).textContent).toBe('Use 20 kg');
    expect((button('5 kg less') as HTMLButtonElement).disabled).toBe(true);
  });
});
