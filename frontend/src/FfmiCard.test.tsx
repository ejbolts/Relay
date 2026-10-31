// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { FfmiCard } from './FfmiCard';
import type { BodyMeasurement, FfmiProfile } from './types';

vi.mock('./api', () => ({ api: { getFfmiProfile: vi.fn(), updateFfmiProfile: vi.fn() } }));

const emptyProfile: FfmiProfile = {
  sex: null,
  height_cm: null,
  wrist_cm: null,
  ankle_cm: null,
  target_body_fat_pct: 10,
};
const measurements: BodyMeasurement[] = [
  {
    id: 'latest',
    measurement_date: '2026-10-20',
    weight_kg: 72.2,
    body_fat_pct: 23,
    notes: null,
    is_sample: false,
    created_at: '2026-10-20T08:00:00Z',
  },
];

let root: Root;
let host: HTMLDivElement;

async function render(profile: FfmiProfile, items = measurements) {
  vi.mocked(api.getFfmiProfile).mockResolvedValue(profile);
  await act(async () => root.render(<FfmiCard measurements={items} />));
}

function button(text: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!match) throw new Error(`No ${text} button`);
  return match;
}

function modelButton(): HTMLButtonElement {
  return host.querySelector<HTMLButtonElement>('.ffmi-model-toggle')!;
}

function setInput(label: string, value: string) {
  const input = [...document.querySelectorAll('label')]
    .find((item) => item.textContent?.startsWith(label))!
    .querySelector('input')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe('FfmiCard', () => {
  it.each([
    ['male', 'Population 5th percentile', 'About 5%', '16.8', '95%'],
    ['male', 'Population median', 'About half', '18.9', 'half'],
    ['male', 'Population 95th percentile', 'About 95%', '21.1', '5%'],
    ['female', 'Population 5th percentile', 'About 5%', '13.8', '95%'],
    ['female', 'Population median', 'About half', '15.4', 'half'],
    ['female', 'Population 95th percentile', 'About 95%', '17.6', '5%'],
  ] as const)(
    'explains %s %s using the selected reference values',
    async (sex, label, portion, value, higher) => {
      await render({ ...emptyProfile, sex, height_cm: 180 });
      const trigger = host.querySelector<HTMLButtonElement>(
        `[aria-label="About ${label.toLowerCase()}"]`,
      )!;
      expect(trigger).not.toBeNull();
      await act(async () => trigger.click());
      const dialog = document.querySelector('dialog')!;
      expect(dialog.querySelector('h2')?.textContent).toBe(label);
      expect(dialog.textContent).toContain(portion);
      expect(dialog.textContent).toContain(`${sex} reference sample`);
      expect(dialog.textContent).toContain(value);
      expect(dialog.textContent).toContain(`${higher} had a higher value`);
      expect(dialog.textContent).toContain('not a body-fat percentage');
      expect(dialog.querySelector('a')).toBeNull();
      await act(async () =>
        dialog.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })),
      );
      expect(document.querySelector('dialog')).toBeNull();
    },
  );

  it('saves model switches, recalculates the scale and retains frame measurements after reloading', async () => {
    let stored: FfmiProfile = {
      ...emptyProfile,
      sex: 'male',
      height_cm: 180,
      wrist_cm: 17.5,
      ankle_cm: 22.5,
    };
    await render(stored);
    vi.mocked(api.getFfmiProfile).mockImplementation(async () => stored);
    vi.mocked(api.updateFfmiProfile).mockImplementation(async (next) => (stored = next));
    expect(modelButton().getAttribute('aria-label')).toContain(
      'Male FFMI model. Switch to female.',
    );
    expect(host.querySelectorAll('.ffmi-model-toggle')).toHaveLength(1);
    expect(modelButton().textContent?.trim()).toBe('\u2642');
    expect(host.querySelector('.ffmi-legend')?.textContent).toContain('18.9Population median');

    await act(async () => modelButton().click());
    expect(api.updateFfmiProfile).toHaveBeenLastCalledWith({ ...stored, sex: 'female' });
    expect(host.querySelector('.ffmi-scale-key')?.textContent).toBe('You 17.2');
    expect(modelButton().getAttribute('aria-label')).toBe('Female FFMI model. Switch to male.');
    expect(modelButton().textContent?.trim()).toBe('\u2640');
    expect(host.querySelector('.ffmi-legend')?.textContent).toContain('15.4Population median');
    expect(host.querySelector('.ffmi-score strong')?.textContent).toBe('17.2');

    await act(async () => root.render(null));
    await act(async () => root.render(<FfmiCard measurements={measurements} />));
    expect(modelButton().getAttribute('aria-label')).toBe('Female FFMI model. Switch to male.');
    await act(async () => modelButton().click());
    expect(stored).toMatchObject({ sex: 'male', height_cm: 180, wrist_cm: 17.5, ankle_cm: 22.5 });
    expect(host.querySelector('.ffmi-scale-key')?.textContent).toBe('You 17.2');
  });

  it('locks switches while saving, retains the saved model after failure and supports retry', async () => {
    const profile = { ...emptyProfile, sex: 'male' as const, height_cm: 180 };
    await render(profile);
    let rejectSave!: (error: Error) => void;
    vi.mocked(api.updateFfmiProfile).mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectSave = reject;
      }),
    );
    await act(async () => modelButton().click());
    expect(modelButton().disabled).toBe(true);
    expect(button('Edit').disabled).toBe(true);
    await act(async () => modelButton().click());
    expect(api.updateFfmiProfile).toHaveBeenCalledTimes(1);
    await act(async () => rejectSave(new Error('Connection interrupted. Try again.')));
    expect(modelButton().getAttribute('aria-label')).toBe('Male FFMI model. Switch to female.');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'Connection interrupted. Try again.',
    );
    expect(modelButton().disabled).toBe(false);
    vi.mocked(api.updateFfmiProfile).mockResolvedValue({ ...profile, sex: 'female' });
    await act(async () => modelButton().click());
    expect(modelButton().getAttribute('aria-label')).toBe('Female FFMI model. Switch to male.');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('can save the model before height is entered without showing a score', async () => {
    await render(emptyProfile);
    expect(modelButton().getAttribute('aria-label')).toBe('Select male FFMI model');
    vi.mocked(api.updateFfmiProfile).mockResolvedValue({ ...emptyProfile, sex: 'male' });
    await act(async () => modelButton().click());
    expect(api.updateFfmiProfile).toHaveBeenCalledWith({ ...emptyProfile, sex: 'male' });
    expect(host.querySelector('.ffmi-score')).toBeNull();
    await act(async () => button('Add height and sex').click());
    expect(button('Male').getAttribute('aria-checked')).toBe('true');
  });

  it('preserves saved frame measurements when editing the female model', async () => {
    const profile: FfmiProfile = {
      ...emptyProfile,
      sex: 'male',
      height_cm: 180,
      wrist_cm: 17.5,
      ankle_cm: 22.5,
    };
    await render(profile);
    await act(async () => button('Edit').click());
    await act(async () => button('Female').click());
    await act(async () => setInput('Height', '175'));
    const saved = { ...profile, sex: 'female' as const, height_cm: 175 };
    vi.mocked(api.updateFfmiProfile).mockResolvedValue(saved);
    await act(async () => button('Save').click());
    expect(api.updateFfmiProfile).toHaveBeenCalledWith(saved);
    await act(async () => button('Edit').click());
    await act(async () => button('Male').click());
    const values = [...document.querySelectorAll<HTMLInputElement>('.ffmi-profile-form input')].map(
      (input) => input.value,
    );
    expect(values).toEqual(['175', '17.5', '22.5', '10']);
  });

  it('keeps a high score separate from the frame estimate and removes drug-use and athlete ranks', async () => {
    await render({ ...emptyProfile, sex: 'male', height_cm: 180, wrist_cm: 17.5, ankle_cm: 22.5 }, [
      { ...measurements[0], weight_kg: 94, body_fat_pct: 10 },
    ]);
    expect(host.querySelector('.ffmi-score strong')?.textContent).toBe('26.1');
    expect(host.querySelector('.ffmi-scale-key')?.textContent).toBe('You 26.1');
    expect(host.querySelector('.ffmi-frame-estimate')?.textContent).toContain('Estimated FFMI24.7');
    expect(host.querySelector('.ffmi-frame-estimate summary')?.textContent).toBe(
      'Estimated natural muscular potential',
    );
    expect(host.querySelector('.ffmi-scale-marker.max')).toBeNull();
    expect(host.textContent).not.toMatch(/steroid user|Competitive|Exceptional reported/);
    expect(host.querySelector<HTMLDetailsElement>('.ffmi-frame-estimate')?.open).toBe(false);
    expect(host.querySelector('.ffmi-scale-track')?.getAttribute('aria-label')).toContain(
      'Male population reference',
    );
    expect(host.textContent).not.toContain('Natural max');
  });
  it('asks for height and sex, then saves them and shows the score', async () => {
    await render(emptyProfile);
    expect(host.textContent).toContain('Add height and sex');

    await act(async () => button('Add height and sex').click());
    await act(async () => button('Male').click());
    await act(async () => {
      setInput('Height', '160');
      setInput('Wrist', '16.2');
      setInput('Ankle', '20.6');
      setInput('Target body fat', '13');
    });
    const saved: FfmiProfile = {
      sex: 'male',
      height_cm: 160,
      wrist_cm: 16.2,
      ankle_cm: 20.6,
      target_body_fat_pct: 13,
    };
    vi.mocked(api.updateFfmiProfile).mockResolvedValue(saved);
    await act(async () => button('Save').click());

    expect(api.updateFfmiProfile).toHaveBeenCalledWith(saved);
    expect(host.querySelector('.ffmi-score strong')?.textContent).toBe('21.7');
    expect(host.querySelector('.ffmi-scale-key')?.textContent).toBe('You 21.7');
    expect(host.querySelectorAll('.ffmi-legend li')).toHaveLength(3);
    expect(host.querySelectorAll('.ffmi-legend li.reached')).toHaveLength(0);
    expect(host.querySelector('.ffmi-potential')?.textContent).toContain(
      'Estimated weight at 13% fat',
    );
  });

  it('keeps the editor open with an error for an invalid height', async () => {
    await render(emptyProfile);
    await act(async () => button('Add height and sex').click());
    await act(async () => button('Female').click());
    expect(document.body.textContent).not.toContain('Wrist (cm)');
    await act(async () => setInput('Height', '20'));
    await act(async () => button('Save').click());

    expect(api.updateFfmiProfile).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Enter a height between 100 and 250 cm.');
  });

  it('asks for a body fat check-in and frame sizes when they are missing', async () => {
    const profile = { ...emptyProfile, sex: 'male' as const, height_cm: 180 };
    await render(profile, [{ ...measurements[0], body_fat_pct: null }]);
    expect(host.textContent).toContain('Log a weigh-in with body fat % to see your FFMI.');

    await render(profile);
    expect(host.querySelector('.ffmi-potential')).toBeNull();
    // 79.8 kg at 14.6% and 1.8 m scores exactly 21, shown with its decimal.
    await render(profile, [{ ...measurements[0], weight_kg: 79.8, body_fat_pct: 14.6 }]);
    expect(host.querySelector('.ffmi-score strong')?.textContent).toBe('21.0');
    expect(host.textContent).toContain('Add wrist and ankle for a model reference');
  });

  it('shows optional male height adjustment and sensitivity without changing the chart score', async () => {
    await render({ ...emptyProfile, sex: 'male', height_cm: 200 }, [
      { ...measurements[0], weight_kg: 100, body_fat_pct: 20 },
    ]);
    expect(host.querySelector('.ffmi-score strong')?.textContent).toBe('20.0');
    expect(host.querySelector('.ffmi-score-details')?.textContent).toContain(
      'Height-adjusted FFMI18.8',
    );
    expect(host.querySelector('.ffmi-score-details')?.textContent).toContain('19.3');
    expect(host.querySelector('.ffmi-score-details')?.textContent).toContain('20.8');
  });

  it('gives women a model reference from height alone', async () => {
    await render({ ...emptyProfile, sex: 'female', height_cm: 165 }, [
      { ...measurements[0], weight_kg: 60, body_fat_pct: 22 },
    ]);
    expect(host.querySelector('.ffmi-score span')).toBeNull();
    expect(host.querySelector('.ffmi-frame-estimate')?.textContent).toContain('Estimated FFMI20.0');
    expect(host.querySelector('.ffmi-frame-estimate summary')?.textContent).toBe(
      'Estimated natural muscular potential',
    );
    expect(host.querySelector('.ffmi-score-details')?.textContent).not.toContain('Height-adjusted');
    expect(host.querySelector('.ffmi-scale-key')?.textContent).toBe('You 17.2');
  });
});
