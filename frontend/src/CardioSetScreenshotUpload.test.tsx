// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CardioSetScreenshotUpload } from './CardioSetScreenshotUpload';
import { api } from './api';
import type { CardioScreenshotScan } from './types';

vi.mock('./api', () => ({ api: { scanCardioScreenshot: vi.fn() } }));
const scan: CardioScreenshotScan = {
  session_date: null,
  activity_type: 'Treadmill',
  duration_minutes: 40,
  calories_kcal: 448,
  average_heart_rate_bpm: 143,
  distance_km: 2.98,
  average_speed_kph: 4.5,
  fields_found: ['duration', 'distance'],
  warning: null,
};
let root: Root;
let container: HTMLDivElement;
const onScan = vi.fn();
const read = vi.fn();
const image = () => ({
  types: ['text/plain', 'image/png'],
  getType: vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' })),
});
const paste = () => container.querySelector<HTMLButtonElement>('button')!;
const upload = () => container.querySelector<HTMLInputElement>('input')!;
const clickPaste = () => act(async () => paste().click());

beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', { clipboard: { read } });
  read.mockResolvedValue([image()]);
  vi.mocked(api.scanCardioScreenshot).mockResolvedValue(scan);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<CardioSetScreenshotUpload onScan={onScan} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('reads an image after the tap and sends it to the existing scanner once', async () => {
  expect(read).not.toHaveBeenCalled();
  read.mockResolvedValue([{ types: ['text/plain'] }, image()]);
  await clickPaste();
  const file = vi.mocked(api.scanCardioScreenshot).mock.calls[0][0];
  expect(file).toBeInstanceOf(File);
  expect(file.type).toBe('image/png');
  expect(file.name).toBe('screenshot.png');
  expect(file.size).toBe(5);
  expect(read).toHaveBeenCalledOnce();
  expect(onScan).toHaveBeenCalledExactlyOnceWith(scan);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it('prevents duplicate reads and uploads while the paste prompt or scan is pending', async () => {
  let resolveRead!: (items: unknown[]) => void;
  let resolveScan!: (value: CardioScreenshotScan) => void;
  read.mockReturnValue(
    new Promise((resolve) => {
      resolveRead = resolve;
    }),
  );
  vi.mocked(api.scanCardioScreenshot).mockReturnValue(
    new Promise((resolve) => {
      resolveScan = resolve;
    }),
  );
  await act(async () => {
    paste().click();
    paste().click();
  });
  expect(paste().disabled).toBe(true);
  expect(upload().disabled).toBe(true);
  expect(read).toHaveBeenCalledOnce();
  expect(container.textContent).toContain('Reading clipboard');
  await act(async () => resolveRead([image()]));
  expect(container.textContent).toContain('Scanning');
  expect(paste().disabled).toBe(true);
  await act(async () => resolveScan(scan));
  expect(paste().disabled).toBe(false);
  expect(upload().disabled).toBe(false);
});

it.each([{ items: [] }, { items: [{ types: ['text/plain'] }] }])(
  'explains an empty or non-image clipboard without scanning (%j)',
  async ({ items }) => {
    read.mockResolvedValue(items);
    await clickPaste();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Copy a screenshot first',
    );
    expect(api.scanCardioScreenshot).not.toHaveBeenCalled();
    expect(onScan).not.toHaveBeenCalled();
    expect(upload().disabled).toBe(false);
  },
);

it('recovers from denied access and lets the user retry', async () => {
  read.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
  await clickPaste();
  expect(container.textContent).toContain('allow Paste');
  await clickPaste();
  expect(onScan).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it('keeps upload available when clipboard reading is unsupported', async () => {
  vi.stubGlobal('navigator', {});
  await clickPaste();
  expect(container.textContent).toContain('unavailable in this browser');
  expect(upload().disabled).toBe(false);
  expect(api.scanCardioScreenshot).not.toHaveBeenCalled();
});

it('shows a scanner failure without changing the set', async () => {
  vi.mocked(api.scanCardioScreenshot).mockRejectedValue(
    new Error('Could not read workout metrics.'),
  );
  await clickPaste();
  expect(container.textContent).toContain('Could not read workout metrics.');
  expect(onScan).not.toHaveBeenCalled();
  expect(paste().disabled).toBe(false);
});

it('keeps scan warnings visible', async () => {
  vi.mocked(api.scanCardioScreenshot).mockResolvedValue({
    ...scan,
    warning: 'Check the distance.',
  });
  await clickPaste();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Check the distance.');
  expect(onScan).toHaveBeenCalledOnce();
});

it('preserves file upload and resets the picker so the same file can be chosen again', async () => {
  const file = new File(['upload'], 'workout.jpg', { type: 'image/jpeg' });
  Object.defineProperty(upload(), 'files', { configurable: true, value: [file] });
  await act(async () => upload().dispatchEvent(new Event('change', { bubbles: true })));
  expect(api.scanCardioScreenshot).toHaveBeenCalledExactlyOnceWith(file);
  expect(onScan).toHaveBeenCalledOnce();
  expect(read).not.toHaveBeenCalled();
  expect(upload().value).toBe('');
});
