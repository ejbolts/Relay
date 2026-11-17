// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataExportDialog } from './DataExportDialog';
import { api } from './api';

vi.mock('./api', () => ({
  api: { exportWorkouts: vi.fn(), exportBodyMeasurements: vi.fn() },
}));

let root: Root;
let container: HTMLDivElement;
const onClose = vi.fn();
const downloads: string[] = [];
const workoutBlob = new Blob(['workout rows']);
const bodyBlob = new Blob(['bodyweight rows']);

beforeEach(async () => {
  vi.clearAllMocks();
  downloads.length = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn().mockReturnValue('blob:sample-export'),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
  vi.mocked(api.exportWorkouts).mockResolvedValue(workoutBlob);
  vi.mocked(api.exportBodyMeasurements).mockResolvedValue(bodyBlob);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <DataExportDialog
        workoutDates={['2026-09-15']}
        bodyweightDates={['2026-10-18']}
        onClose={onClose}
      />,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const inputs = () => [...document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
const download = () => document.querySelector<HTMLButtonElement>('.popup-primary-action')!;
async function click(element: HTMLElement) {
  await act(async () => element.click());
}

describe('Relay export choices', () => {
  it('opens without exporting and Cancel never sends requests', async () => {
    expect(api.exportWorkouts).not.toHaveBeenCalled();
    await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!);
    expect(onClose).toHaveBeenCalledOnce();
    expect(api.exportWorkouts).not.toHaveBeenCalled();
    expect(api.exportBodyMeasurements).not.toHaveBeenCalled();
  });

  it('exports only workouts by default and reports the downloaded file', async () => {
    await click(download());
    expect(api.exportWorkouts).toHaveBeenCalledWith({});
    expect(api.exportBodyMeasurements).not.toHaveBeenCalled();
    expect(downloads).toEqual([expect.stringMatching(/^gym-workouts-.*\.csv$/)]);
    expect(document.querySelector('[role=status]')?.textContent).toBe('CSV downloaded.');
    expect(URL.createObjectURL).toHaveBeenCalledWith(workoutBlob);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it('exports only bodyweight and prevents an empty selection', async () => {
    await click(inputs()[0]);
    expect(download().disabled).toBe(true);
    await click(inputs()[1]);
    expect(download().disabled).toBe(false);
    await click(download());
    expect(api.exportWorkouts).not.toHaveBeenCalled();
    expect(api.exportBodyMeasurements).toHaveBeenCalledWith({});
    expect(URL.createObjectURL).toHaveBeenCalledWith(bodyBlob);
    expect(downloads[0]).toMatch(/^body-weight-.*\.csv$/);
  });

  it('exports both with one date range ending at the latest selected entry', async () => {
    await click(inputs()[1]);
    const select = document.querySelector('select')!;
    await act(async () => {
      select.value = '1m';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click(download());
    const range = { start_date: '2026-09-18', end_date: '2026-10-18' };
    expect(api.exportWorkouts).toHaveBeenCalledWith(range);
    expect(api.exportBodyMeasurements).toHaveBeenCalledWith(range);
    expect(downloads).toEqual([
      'gym-workouts-2026-09-18-to-2026-10-18.csv',
      'body-weight-2026-09-18-to-2026-10-18.csv',
    ]);
    expect(document.querySelector('[role=status]')?.textContent).toBe('Both CSV files downloaded.');
  });

  it('downloads neither file if preparing either fails, and allows retry', async () => {
    await click(inputs()[1]);
    vi.mocked(api.exportBodyMeasurements).mockRejectedValueOnce(new Error('Try again later.'));
    await click(download());
    expect(downloads).toEqual([]);
    expect(document.querySelector('[role=alert]')?.textContent).toBe('Try again later.');
    expect(download().disabled).toBe(false);
    await click(download());
    expect(downloads).toHaveLength(2);
  });
});
