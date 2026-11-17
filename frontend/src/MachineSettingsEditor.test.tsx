// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { MachineSettingsEditor } from './MachineSettingsEditor';
import type { MachineSetting } from './types';

let root: Root;
let container: HTMLDivElement;
const changed = vi.fn();
const settings = [{ name: 'Seat', value: '5' }];

function input(label: string) {
  return [...container.querySelectorAll('input')].find(
    (item) => item.getAttribute('aria-label') === label,
  )!;
}
async function type(label: string, value: string) {
  await act(async () => {
    const target = input(label);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function click(label: string) {
  await act(async () => {
    const button = [...container.querySelectorAll('button')].find(
      (item) => item.getAttribute('aria-label') === label || item.textContent === label,
    );
    if (!button) throw new Error(`Missing ${label}`);
    button.click();
  });
}
async function render(initialSettings?: MachineSetting[], exerciseId = 'press') {
  await act(async () =>
    root.render(
      <MachineSettingsEditor
        key={exerciseId}
        exerciseId={exerciseId}
        initialSettings={initialSettings}
        onChange={changed}
      />,
    ),
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(api, 'getMachineSettings').mockResolvedValue({ settings: [] });
  vi.spyOn(api, 'saveMachineSettings').mockImplementation(async (_id, values) => ({
    settings: values,
  }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  changed.mockReset();
});

describe('custom machine settings', () => {
  it('starts with blank Seat and 5 placeholders and saves named numeric settings', async () => {
    await render();
    expect(input('Setting 1 name').value).toBe('');
    expect(input('Setting 1 name').placeholder).toBe('Seat');
    expect(input('Setting 1 value').placeholder).toBe('5');
    expect(input('Setting 1 value').type).toBe('number');
    expect(input('Setting 1 value').inputMode).toBe('decimal');
    await type('Setting 1 name', ' Start angle ');
    await type('Start angle value', '45');
    await click('+ Add');
    expect(document.activeElement).toBe(input('Setting 2 name'));
    await type('Setting 2 name', 'Pad');
    await type('Pad value', '2.5');
    await click('Save');
    expect(api.saveMachineSettings).toHaveBeenCalledWith('press', [
      { name: 'Start angle', value: '45' },
      { name: 'Pad', value: '2.5' },
    ]);
    expect(changed).toHaveBeenLastCalledWith([
      { name: 'Start angle', value: '45' },
      { name: 'Pad', value: '2.5' },
    ]);
  });
  it('rejects letters and unit text instead of saving them', async () => {
    await render([]);
    await type('Setting 1 name', 'Seat');
    for (const invalid of ['B', '45 degrees', 'Infinity', 'NaN']) {
      await type('Seat value', invalid);
      await click('Save');
      expect(api.saveMachineSettings).not.toHaveBeenCalled();
      expect(input('Seat value').value).toBe('');
    }
    await type('Seat value', '0');
    await click('Save');
    expect(changed).toHaveBeenCalledWith([{ name: 'Seat', value: '0' }]);
  });
  it('requires an old text value to be replaced before saving', async () => {
    await render([{ name: 'Seat', value: 'B' }]);
    await click('Save');
    expect(api.saveMachineSettings).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Enter a number');
    await type('Seat value', '5');
    await click('Save');
    expect(changed).toHaveBeenCalledWith(settings);
  });
  it('loads saved settings, removes rows and clears all saved settings', async () => {
    vi.mocked(api.getMachineSettings).mockResolvedValue({ settings });
    await render();
    expect(input('Seat value').value).toBe('5');
    expect(changed).toHaveBeenCalledWith(settings);
    await click('Remove Seat');
    expect(document.activeElement?.textContent).toBe('+ Add');
    await click('Save');
    expect(api.saveMachineSettings).toHaveBeenLastCalledWith('press', []);
  });
  it('keeps historical or restored settings instead of fetching current defaults', async () => {
    await render([{ name: 'Backrest', value: '2' }]);
    expect(api.getMachineSettings).not.toHaveBeenCalled();
    expect(input('Backrest value').value).toBe('2');
  });
  it('validates partial rows and ignores unused blank rows', async () => {
    await render([]);
    await type('Setting 1 name', 'Seat');
    await click('Save');
    expect(api.saveMachineSettings).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('name and value');
    await type('Seat value', '5');
    await click('+ Add');
    await click('Save');
    expect(api.saveMachineSettings).toHaveBeenCalledWith('press', settings);
  });
  it('preserves edits after a failed save and lets the user retry', async () => {
    vi.mocked(api.saveMachineSettings).mockRejectedValueOnce(new Error('offline'));
    await render(settings);
    await type('Seat value', '2.5');
    await click('Save');
    expect(input('Seat value').value).toBe('2.5');
    expect(changed).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not save');
    await click('Save');
    expect(changed).toHaveBeenCalledWith([{ name: 'Seat', value: '2.5' }]);
  });
  it('does not allow a failed load to overwrite existing defaults', async () => {
    vi.mocked(api.getMachineSettings).mockRejectedValueOnce(new Error('offline'));
    await render();
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(container.textContent).toContain('Could not load');
    await click('Retry');
    expect(input('Setting 1 name')).toBeDefined();
  });
  it('ignores a late response when the exercise changes', async () => {
    let resolve!: (value: { settings: MachineSetting[] }) => void;
    vi.mocked(api.getMachineSettings).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await render();
    await render([], 'row');
    await act(async () => resolve({ settings }));
    expect(input('Setting 1 name').value).toBe('');
    expect(changed).not.toHaveBeenCalled();
  });
});
