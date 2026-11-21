// @vitest-environment jsdom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createToastRoot, toastElement, toastText } from './toastTestUtils';
import { TOAST_MS } from './Toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkoutShareMenu } from './WorkoutShareMenu';
import { api } from './api';
import { workoutExportFileName } from './downloadFile';
import type { TrackedWorkout } from './types';

vi.mock('./api', () => ({ api: { exportWorkout: vi.fn() } }));

const workout = {
  id: 'workout-1',
  name: 'Push Day: Chest & Triceps!',
  workout_date: '2026-11-14',
} as TrackedWorkout;

let root: Root;
let container: HTMLDivElement;
const downloads: string[] = [];
const onShareCard = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  downloads.length = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:workout'), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createToastRoot(container);
  act(() => root.render(<WorkoutShareMenu workout={workout} onShareCard={onShareCard} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const trigger = () => container.querySelector<HTMLButtonElement>('.workout-share-trigger')!;
const menuItems = () => [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
const choose = async (label: string) => {
  act(() => trigger().click());
  await act(async () =>
    menuItems()
      .find((item) => item.textContent === label)!
      .click(),
  );
};

describe('workout share menu', () => {
  it('names the export file after the workout date and name', () => {
    expect(workoutExportFileName(workout)).toBe('workout-2026-11-14-push-day-chest-triceps.csv');
    expect(workoutExportFileName({ ...workout, name: '!!!' })).toBe('workout-2026-11-14.csv');
  });

  it('offers the share card and CSV export from one Export button', () => {
    expect(trigger().textContent).toBe('Export');
    expect(menuItems()).toHaveLength(0);

    act(() => trigger().click());

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(menuItems().map((item) => item.textContent)).toEqual(['Share card', 'Export CSV']);
    expect(document.activeElement).toBe(menuItems()[0]);
  });

  it('opens the share card and closes the menu', async () => {
    await choose('Share card');

    expect(onShareCard).toHaveBeenCalledOnce();
    expect(menuItems()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger());
  });

  it('closes with Escape and moves between options with the arrow keys', () => {
    act(() => trigger().click());
    const key = (name: string) =>
      act(() =>
        document.activeElement!.dispatchEvent(
          new KeyboardEvent('keydown', { key: name, bubbles: true }),
        ),
      );

    key('ArrowDown');
    expect(document.activeElement?.textContent).toBe('Export CSV');
    key('ArrowDown');
    expect(document.activeElement?.textContent).toBe('Share card');
    key('Escape');
    expect(menuItems()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger());
  });

  it('downloads only that workout and confirms in a toast that clears itself', async () => {
    vi.useFakeTimers();
    vi.mocked(api.exportWorkout).mockResolvedValue(new Blob(['rows']));

    await choose('Export CSV');

    expect(api.exportWorkout).toHaveBeenCalledWith('workout-1');
    expect(downloads).toEqual(['workout-2026-11-14-push-day-chest-triceps.csv']);
    expect(toastText()).toBe('Workout exported');
    expect(container.querySelector('[role="alert"]')).toBeNull();

    act(() => vi.advanceTimersByTime(TOAST_MS.standard));
    expect(toastElement()).toBeNull();
  });

  it('shows an export failure beside the button and creates no download', async () => {
    vi.mocked(api.exportWorkout).mockRejectedValue(new Error('You are offline.'));

    await choose('Export CSV');

    expect(downloads).toEqual([]);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('You are offline.');
    expect(toastElement()).toBeNull();
    expect(trigger().disabled).toBe(false);
  });
});
