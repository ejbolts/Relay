// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkoutExportButton } from './WorkoutExportButton';
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
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const button = () => container.querySelector<HTMLButtonElement>('.export-workout-button')!;

describe('single workout export', () => {
  it('names the file after the workout date and name', () => {
    expect(workoutExportFileName(workout)).toBe('workout-2026-11-14-push-day-chest-triceps.csv');
    expect(workoutExportFileName({ ...workout, name: '!!!' })).toBe('workout-2026-11-14.csv');
  });

  it('downloads only that workout and confirms in a toast that clears itself', async () => {
    vi.useFakeTimers();
    vi.mocked(api.exportWorkout).mockResolvedValue(new Blob(['rows']));
    act(() => root.render(<WorkoutExportButton workout={workout} />));

    await act(async () => button().click());

    expect(api.exportWorkout).toHaveBeenCalledWith('workout-1');
    expect(downloads).toEqual(['workout-2026-11-14-push-day-chest-triceps.csv']);
    expect(document.body.querySelector('.top-toast[role="status"]')?.textContent).toContain(
      'Workout exported',
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();

    act(() => vi.advanceTimersByTime(4000));
    expect(document.body.querySelector('.top-toast')).toBeNull();
  });

  it('shows the failure beside the button and creates no download', async () => {
    vi.mocked(api.exportWorkout).mockRejectedValue(new Error('You are offline.'));
    act(() => root.render(<WorkoutExportButton workout={workout} />));

    await act(async () => button().click());

    expect(downloads).toEqual([]);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('You are offline.');
    expect(document.body.querySelector('.top-toast')).toBeNull();
    expect(button().disabled).toBe(false);
  });
});
