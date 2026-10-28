// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CardioZoneSettings } from './CardioZoneSettings';
import { api } from './api';
import type { CardioPreferences } from './types';

let root: Root;
let container: HTMLDivElement;
const preferences: CardioPreferences = {
  heart_rate_zones: Array.from({ length: 5 }, (_, index) => ({
    zone: index + 1,
    min_bpm: 80 + index * 20,
    max_bpm: 99 + index * 20,
  })),
  goals: [{ zone: 2, minutes: 150 }],
};
const click = async (name: string) =>
  act(async () =>
    [...document.querySelectorAll('button')].find((button) => button.textContent === name)!.click(),
  );
const input = async (name: string, value: string) =>
  act(async () => {
    const element = document.querySelector(`input[aria-label="${name}"]`)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
const closed = vi.fn();
const saved = vi.fn().mockResolvedValue(undefined);
beforeEach(async () => {
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
  await act(async () =>
    root.render(<CardioZoneSettings preferences={preferences} onClose={closed} onSaved={saved} />),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it('adds, changes, removes and saves multiple account goals', async () => {
  const update = vi.spyOn(api, 'updateCardioPreferences').mockResolvedValue(preferences);
  await click('Add zone goal');
  await input('Goal 1 minutes', '180');
  expect(document.querySelectorAll('select')).toHaveLength(2);
  await act(async () =>
    document
      .querySelector('[aria-label="Remove Zone 1 goal"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true })),
  );
  await click('Add zone goal');
  await click('Save zones & goals');
  expect(update).toHaveBeenCalledWith({
    ...preferences,
    goals: [
      { zone: 2, minutes: 180 },
      { zone: 1, minutes: 30 },
    ],
  });
  expect(saved).toHaveBeenCalledOnce();
  expect(closed).toHaveBeenCalledOnce();
});
it('blocks overlapping ranges and preserves edits when saving fails', async () => {
  const update = vi.spyOn(api, 'updateCardioPreferences').mockRejectedValue(new Error('Try again'));
  await input('Zone 2 minimum bpm', '99');
  await click('Save zones & goals');
  expect(document.querySelector('[role="alert"]')!.textContent).toContain('without overlapping');
  expect(update).not.toHaveBeenCalled();
  await input('Zone 2 minimum bpm', '100');
  await click('Save zones & goals');
  expect(document.querySelector('[role="alert"]')!.textContent).toBe('Try again');
  expect(closed).not.toHaveBeenCalled();
});
