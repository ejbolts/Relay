// @vitest-environment jsdom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { DefaultRestSetting } from './DefaultRestSetting';
import { createToastRoot } from './toastTestUtils';
import { TrainingPreferencesContext } from './trainingPreferencesContext';
import type { TrainingPreferences } from './types';

vi.mock('./api', () => ({ api: { updateTrainingPreferences: vi.fn() } }));

const saved: TrainingPreferences = {
  preferred_weight_unit: 'kg',
  week_start: 'monday',
  zone2_goal_minutes: 150,
  weekly_muscle_set_goal: 10,
  weekly_muscle_set_goals: {},
  default_rest_seconds: null,
};

let host: HTMLDivElement;
let root: Root;
const applySaved = vi.fn();

async function show(preferences: TrainingPreferences | null) {
  await act(async () =>
    root.render(
      <TrainingPreferencesContext.Provider value={{ preferences, error: null, applySaved }}>
        <DefaultRestSetting />
      </TrainingPreferencesContext.Provider>,
    ),
  );
}

const select = () => host.querySelector<HTMLSelectElement>('[aria-label="Default rest"]')!;
const optionLabels = () => [...select().options].map((option) => option.textContent);

async function choose(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(
      select(),
      value,
    );
    select().dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(api.updateTrainingPreferences).mockReset();
  vi.mocked(api.updateTrainingPreferences).mockImplementation(async (value) => value);
  applySaved.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createToastRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('default rest setting', () => {
  it('starts at None, also for preferences from an older server', async () => {
    await show({ ...saved, default_rest_seconds: undefined });
    expect(select().value).toBe('');
    expect(optionLabels()[0]).toBe('None');
    expect(optionLabels()).toContain('3:00');
  });

  it('saves a chosen rest and clears it with None', async () => {
    await show(saved);
    await choose('120');
    expect(api.updateTrainingPreferences).toHaveBeenLastCalledWith({
      ...saved,
      default_rest_seconds: 120,
    });
    expect(applySaved).toHaveBeenCalledOnce();
    expect(document.body.querySelector('.toast')?.textContent).toContain('Default rest saved.');

    await show({ ...saved, default_rest_seconds: 120 });
    expect(select().value).toBe('120');
    await choose('');
    expect(api.updateTrainingPreferences).toHaveBeenLastCalledWith({
      ...saved,
      default_rest_seconds: null,
    });
  });

  it('lists a saved rest that is not one of the choices', async () => {
    await show({ ...saved, default_rest_seconds: 75 });
    expect(select().value).toBe('75');
    expect(optionLabels()).toContain('1:15');
  });

  it('shows a failed save beside the setting', async () => {
    vi.mocked(api.updateTrainingPreferences).mockRejectedValue(new Error('Offline.'));
    await show(saved);
    await choose('90');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'Could not save the default rest. Offline.',
    );
    expect(applySaved).not.toHaveBeenCalled();
  });

  it('waits for the preferences to load', async () => {
    await show(null);
    expect(select().disabled).toBe(true);
  });
});
