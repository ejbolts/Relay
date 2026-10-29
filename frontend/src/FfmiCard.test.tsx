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
  it('allows a current score above the estimated potential and distinguishes exceptional references', async () => {
    await render({ ...emptyProfile, sex: 'male', height_cm: 180, wrist_cm: 17.5, ankle_cm: 22.5 }, [
      { ...measurements[0], weight_kg: 94, body_fat_pct: 10 },
    ]);
    expect(host.querySelector('.ffmi-score strong')?.textContent).toBe('26.1');
    expect(host.querySelector('.ffmi-scale-key')?.textContent).toBe(
      'You 26.1Estimated potential 24.7',
    );
    expect(host.textContent).toContain('Exceptional reported natural case');
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
    expect(host.querySelector('.ffmi-score strong')?.textContent).toBe('22.9');
    expect(host.querySelector('.ffmi-scale-key')?.textContent).toBe(
      'You 22.9Estimated potential 26.9',
    );
    expect(host.querySelectorAll('.ffmi-legend li.reached')).toHaveLength(3);
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
    expect(host.textContent).toContain('Add wrist and ankle for a potential estimate');
  });

  it('gives women a model reference from height alone', async () => {
    await render({ ...emptyProfile, sex: 'female', height_cm: 165 }, [
      { ...measurements[0], weight_kg: 60, body_fat_pct: 22 },
    ]);
    expect(host.querySelector('.ffmi-score span')?.textContent).toBe('Gender-adjusted FFMI');
    expect(host.querySelector('.ffmi-scale-key')?.textContent).toBe(
      'You 21.2Estimated potential 24.7',
    );
  });
});
