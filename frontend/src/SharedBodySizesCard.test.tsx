// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BODY_SIZE_FIELDS, type BodySizeLog } from './bodySizes';
import { SharedBodySizesCard } from './SharedBodySizesCard';

let unit = 'kg';
vi.mock('./trainingPreferencesContext', () => ({ useWeightUnit: () => unit }));

let root: Root;
let host: HTMLDivElement;
const entry = (date: string, values = {}): BodySizeLog =>
  ({
    ...Object.fromEntries(BODY_SIZE_FIELDS.map(([key]) => [key, null])),
    measurement_date: date,
    ...values,
  }) as BodySizeLog;
beforeEach(() => {
  unit = 'kg';
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("shows only what the member measured, on their outline, in the viewer's unit", async () => {
  unit = 'lb';
  await act(async () =>
    root.render(
      <SharedBodySizesCard
        sex="female"
        entries={[
          entry('2026-10-27', { waist_cm: 76.2, hips_cm: 96.52 }),
          entry('2026-10-20', { waist_cm: 78.74 }),
        ]}
      />,
    ),
  );
  expect(host.querySelector('.body-figure')?.getAttribute('data-figure')).toBe('female');
  const labels = [...host.querySelectorAll('.body-figure-label')];
  expect(labels.map((label) => label.textContent)).toEqual(['Waist30 in', 'Hips38 in']);
  // Someone else's measurements are read, not edited.
  expect(host.querySelector('[data-field][role="button"]')).toBeNull();
  expect(host.querySelector('.body-figure-hit')).toBeNull();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Earlier measurements"]')!.click(),
  );
  expect(host.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-20');
  expect(host.querySelectorAll('.body-figure-label')).toHaveLength(1);
});

it('uses the male outline when the member has not set a sex', async () => {
  await act(async () =>
    root.render(
      <SharedBodySizesCard sex={null} entries={[entry('2026-10-27', { neck_cm: 38 })]} />,
    ),
  );
  expect(host.querySelector('.body-figure')?.getAttribute('data-figure')).toBe('male');
  expect(host.querySelectorAll('.body-sizes-stepper button')).toHaveLength(0);
});
