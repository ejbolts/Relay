// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { BodySizesCard } from './BodySizesCard';
import { BODY_SIZE_FIELDS, type BodySizeLog } from './bodySizes';

let unit = 'kg';
vi.mock('./trainingPreferencesContext', () => ({ useWeightUnit: () => unit }));
vi.mock('./api', () => ({
  api: { listBodySizes: vi.fn(), saveBodySizes: vi.fn(), deleteBodySizes: vi.fn() },
}));
let root: Root;
let host: HTMLDivElement;
const row = (date: string, values = {}): BodySizeLog =>
  ({
    ...Object.fromEntries(BODY_SIZE_FIELDS.map(([key]) => [key, null])),
    measurement_date: date,
    ...values,
  }) as BodySizeLog;
function button(text: string) {
  const found = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!found) throw new Error(`No ${text} button`);
  return found;
}
function input(label: string, value: string) {
  const target = [...document.querySelectorAll('label')]
    .find((item) => item.textContent?.startsWith(label))!
    .querySelector('input')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
}
async function render(rows: BodySizeLog[] = []) {
  vi.mocked(api.listBodySizes).mockResolvedValue(rows);
  await act(async () => root.render(<BodySizesCard />));
}
beforeEach(() => {
  unit = 'kg';
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
  vi.mocked(api.saveBodySizes).mockImplementation(async (payload) => payload);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.resetAllMocks();
});

describe('BodySizesCard', () => {
  it('retries a failed load and refreshes when the account revision changes', async () => {
    vi.mocked(api.listBodySizes).mockRejectedValueOnce(new Error('Offline'));
    await act(async () => root.render(<BodySizesCard />));
    expect(document.querySelector('[role=alert]')?.textContent).toContain('Offline');
    vi.mocked(api.listBodySizes).mockResolvedValue([row('2026-10-20', { waist_cm: 80 })]);
    await act(async () => button('Retry').click());
    expect(host.textContent).toContain('80 cm');
    vi.mocked(api.listBodySizes).mockResolvedValue([row('2026-10-21', { waist_cm: 79 })]);
    await act(async () => root.render(<BodySizesCard dataRevision="new-revision" />));
    expect(host.textContent).toContain('79 cm');
  });
  it('requires one measurement and saves a circumference without requiring weight', async () => {
    await render();
    expect(host.textContent).toContain('No body measurements yet');
    await act(async () => button('Log measurements').click());
    await act(async () => button('Save measurements').click());
    expect(document.body.textContent).toContain('Enter at least one body measurement.');
    await act(async () => input('Waist', '82.5'));
    await act(async () => button('Save measurements').click());
    expect(api.saveBodySizes).toHaveBeenCalledWith(
      expect.objectContaining({ waist_cm: 82.5, chest_cm: null }),
    );
    expect(host.textContent).toContain('82.5 cm');
    expect(document.querySelector('dialog')).toBeNull();
  });
  it('edits an existing date, clears a value and deletes only after confirmation', async () => {
    await render([row('2026-10-20', { waist_cm: 82, chest_cm: 103 })]);
    await act(async () => button('Edit').click());
    await act(async () => {
      input('Waist', '81');
      input('Chest', '');
    });
    await act(async () => button('Update measurements').click());
    expect(api.saveBodySizes).toHaveBeenCalledWith(
      expect.objectContaining({ measurement_date: '2026-10-20', waist_cm: 81, chest_cm: null }),
    );
    await act(async () => button('Delete').click());
    expect(api.deleteBodySizes).not.toHaveBeenCalled();
    await act(async () => button('Cancel').click());
    await act(async () => button('Delete').click());
    await act(async () => button('Delete measurements').click());
    expect(api.deleteBodySizes).toHaveBeenCalledWith('2026-10-20');
    expect(host.textContent).toContain('No body measurements yet');
  });
  it('converts inches and preserves unchanged stored precision when editing', async () => {
    unit = 'lb';
    await render([row('2026-10-20', { waist_cm: 82.1234 })]);
    expect(host.textContent).toContain('32.3 in');
    await act(async () => button('Edit').click());
    await act(async () => input('Chest', '40'));
    await act(async () => button('Update measurements').click());
    expect(api.saveBodySizes).toHaveBeenCalledWith(
      expect.objectContaining({ waist_cm: 82.1234, chest_cm: 101.6 }),
    );
  });
  it('keeps the form and saved data on failure, then retries', async () => {
    await render([row('2026-10-20', { waist_cm: 82 })]);
    await act(async () => button('Edit').click());
    await act(async () => input('Waist', '301'));
    await act(async () => button('Update measurements').click());
    expect(api.saveBodySizes).not.toHaveBeenCalled();
    await act(async () => input('Waist', '81'));
    vi.mocked(api.saveBodySizes).mockRejectedValueOnce(new Error('Connection failed'));
    await act(async () => button('Update measurements').click());
    expect(document.querySelector('[role=alert]')?.textContent).toBe('Connection failed');
    expect(host.textContent).toContain('82 cm');
    await act(async () => button('Update measurements').click());
    expect(host.textContent).toContain('81 cm');
  });
  it('changing the date loads that dates measurements instead of overwriting from another day', async () => {
    await render([row('2026-10-20', { waist_cm: 82 }), row('2026-10-19', { chest_cm: 100 })]);
    await act(async () => button('Edit').click());
    await act(async () => input('Date', '2026-10-19'));
    await act(async () => button('Update measurements').click());
    expect(api.saveBodySizes).toHaveBeenCalledWith(
      expect.objectContaining({ measurement_date: '2026-10-19', waist_cm: null, chest_cm: 100 }),
    );
  });
});
