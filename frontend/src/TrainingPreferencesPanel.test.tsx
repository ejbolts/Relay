// @vitest-environment jsdom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createToastRoot } from './toastTestUtils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { TrainingPreferencesContext } from './trainingPreferencesContext';
import { GOAL_SAVE_DELAY_MS, TrainingPreferencesPanel } from './TrainingPreferencesPanel';
import type { TrainingPreferences } from './types';

vi.mock('./api', () => ({ api: { updateTrainingPreferences: vi.fn() } }));

const saved: TrainingPreferences = {
  preferred_weight_unit: 'kg',
  week_start: 'monday',
  zone2_goal_minutes: 150,
  weekly_muscle_set_goal: 10,
  weekly_muscle_set_goals: {},
};

let host: HTMLDivElement;
let root: Root;
const applySaved = vi.fn();
const onDataChange = vi.fn().mockResolvedValue(undefined);

async function show() {
  await act(async () =>
    root.render(
      <TrainingPreferencesContext.Provider value={{ preferences: saved, error: null, applySaved }}>
        <TrainingPreferencesPanel exercises={[]} onDataChange={onDataChange} />
      </TrainingPreferencesContext.Provider>,
    ),
  );
}

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype =
    element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(
    new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
  );
}

const goalInput = () => host.querySelector<HTMLInputElement>('input[type=number]')!;
const toast = () => document.body.querySelector('.toast')?.textContent ?? null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.mocked(api.updateTrainingPreferences).mockReset();
  vi.mocked(api.updateTrainingPreferences).mockImplementation(async (value) => value);
  applySaved.mockClear();
  onDataChange.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createToastRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('training preferences save as they change', () => {
  it('saves a new weight unit straight away and confirms in the toast', async () => {
    await show();
    expect(host.textContent).not.toContain('Save preferences');
    await act(async () => setValue(host.querySelector('select')!, 'lb'));
    expect(api.updateTrainingPreferences).toHaveBeenCalledWith({
      ...saved,
      preferred_weight_unit: 'lb',
    });
    expect(applySaved).toHaveBeenCalledOnce();
    expect(onDataChange).toHaveBeenCalledOnce();
    expect(toast()).toContain('Training preferences saved.');
  });

  it('saves a typed goal after a pause, or as soon as the field is left', async () => {
    await show();
    await act(async () => setValue(goalInput(), '12'));
    expect(api.updateTrainingPreferences).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(GOAL_SAVE_DELAY_MS));
    expect(api.updateTrainingPreferences).toHaveBeenLastCalledWith({
      ...saved,
      weekly_muscle_set_goal: 12,
    });
    await act(async () => setValue(goalInput(), '14'));
    await act(async () => goalInput().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(api.updateTrainingPreferences).toHaveBeenLastCalledWith({
      ...saved,
      weekly_muscle_set_goal: 14,
    });
    expect(goalInput().inputMode).toBe('numeric');
  });

  it('keeps an out-of-range goal unsaved and says why beside the fields', async () => {
    await show();
    await act(async () => setValue(goalInput(), '0'));
    await act(async () => vi.advanceTimersByTime(GOAL_SAVE_DELAY_MS));
    expect(api.updateTrainingPreferences).not.toHaveBeenCalled();
    expect(host.querySelector('[role=alert]')?.textContent).toContain('between 1 and 1,000');
    expect(goalInput().getAttribute('aria-invalid')).toBe('true');
  });

  it('keeps the edit and shows the error when saving fails', async () => {
    vi.mocked(api.updateTrainingPreferences).mockRejectedValueOnce(new Error('Offline.'));
    await show();
    await act(async () => setValue(host.querySelector('select')!, 'lb'));
    expect(host.querySelector('[role=alert]')?.textContent).toBe('Offline.');
    expect(host.querySelector('select')!.value).toBe('lb');
    expect(toast()).toBeNull();
  });
});
