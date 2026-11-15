// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { inactiveWorkoutFinishAt, MAX_INACTIVE_WORKOUT_MS } from './activeWorkoutTimeout';
import { WorkoutAutoSaveSetting } from './WorkoutAutoSaveSetting';
import {
  autoSaveChoiceLabel,
  selectWorkoutAutoSaveAccount,
  useWorkoutAutoSaveAccount,
} from './workoutAutoSaveChoice';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    api: { ...original.api, workoutAutoSave: vi.fn(), updateWorkoutAutoSave: vi.fn() },
  };
});

let root: Root;
let container: HTMLDivElement;

function Harness({ userId }: { userId: string }) {
  useWorkoutAutoSaveAccount(userId);
  return <WorkoutAutoSaveSetting userId={userId} />;
}

async function render(userId = 'owner') {
  await act(async () => root.render(<Harness userId={userId} />));
}

const toggle = () =>
  container.querySelector<HTMLButtonElement>('[aria-label="Auto-save unfinished workouts"]')!;
const time = () => container.querySelector<HTMLSelectElement>('.workout-auto-save-time select');

beforeEach(() => {
  localStorage.clear();
  selectWorkoutAutoSaveAccount(null);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(api.workoutAutoSave).mockResolvedValue({ after_minutes: null });
  vi.mocked(api.updateWorkoutAutoSave).mockImplementation(async (value) => ({
    after_minutes: value,
  }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  selectWorkoutAutoSaveAccount(null);
  vi.clearAllMocks();
});

describe('auto-save setting', () => {
  it('labels choices compactly', () => {
    expect([60, 90, 120, 45].map(autoSaveChoiceLabel)).toEqual([
      '1 hour',
      '1 h 30 min',
      '2 hours',
      '45 min',
    ]);
  });

  it('turns on at three hours, changes the time and applies it to the workout cutoff', async () => {
    await render();
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(time()).toBeNull();
    await act(async () => toggle().click());
    expect(api.updateWorkoutAutoSave).toHaveBeenLastCalledWith(180);
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(time()!.value).toBe('180');
    await act(async () => {
      time()!.value = '90';
      time()!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(api.updateWorkoutAutoSave).toHaveBeenLastCalledWith(90);
    expect(inactiveWorkoutFinishAt(0, 0)).toBe(90 * 60_000);
    await act(async () => toggle().click());
    expect(api.updateWorkoutAutoSave).toHaveBeenLastCalledWith(null);
    expect(time()).toBeNull();
    expect(inactiveWorkoutFinishAt(0, 0)).toBe(MAX_INACTIVE_WORKOUT_MS);
  });

  it("uses this device's copy at once, then the account's current choice", async () => {
    localStorage.setItem('relay-workout-auto-save:owner', '120');
    let answer!: (value: { after_minutes: number | null }) => void;
    vi.mocked(api.workoutAutoSave).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await render();
    expect(time()!.value).toBe('120');
    await act(async () => answer({ after_minutes: 240 }));
    expect(time()!.value).toBe('240');
    expect(localStorage.getItem('relay-workout-auto-save:owner')).toBe('240');
  });

  it('keeps each account separate on a shared device', async () => {
    localStorage.setItem('relay-workout-auto-save:owner', '120');
    selectWorkoutAutoSaveAccount('someone-else');
    expect(inactiveWorkoutFinishAt(0, 0)).toBe(MAX_INACTIVE_WORKOUT_MS);
    selectWorkoutAutoSaveAccount('owner');
    expect(inactiveWorkoutFinishAt(0, 0)).toBe(120 * 60_000);
  });

  it('explains a failed change beside the control and keeps the previous choice', async () => {
    vi.mocked(api.updateWorkoutAutoSave).mockRejectedValue(new Error('You are offline.'));
    await render();
    await act(async () => toggle().click());
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Could not change auto-save. You are offline.',
    );
  });
});
