// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { BodyCompositionScreen } from './App';
import { GOAL_UNDO_MS } from './useGoalRemoval';
import type { BodyMeasurement, BodyWeightGoal } from './types';

let root: Root;
let host: HTMLDivElement;

const measurement = (date: string, weight: number): BodyMeasurement => ({
  id: date,
  measurement_date: date,
  weight_kg: weight,
  body_fat_pct: null,
  notes: null,
  is_sample: false,
  created_at: `${date}T07:00:00Z`,
});
const measurements = [
  measurement('2026-10-25', 84.1),
  measurement('2026-10-10', 83.4),
  measurement('2026-08-05', 86.2),
  measurement('2026-07-20', 88.5),
];
const goal = (id: string, start: string, from: number, to: number, active: boolean) =>
  ({
    id,
    start_date: start,
    target_date: '2026-12-31',
    start_weight_kg: from,
    target_weight_kg: to,
    active,
    created_at: `${start}T08:00:00Z`,
  }) as BodyWeightGoal;
const goals = [
  goal('gain', '2026-10-19', 83.4, 85, true),
  goal('lose', '2026-07-31', 88.5, 82, false),
];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.spyOn(api, 'listBodyWeightGoals').mockResolvedValue(goals);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(onDataChange = vi.fn().mockResolvedValue(undefined)) {
  await act(async () =>
    root.render(
      <BodyCompositionScreen
        measurements={measurements}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onDataChange={onDataChange}
      />,
    ),
  );
  return onDataChange;
}

const dividers = () =>
  [...host.querySelectorAll('.body-history-goal-divider')].map((item) =>
    item.getAttribute('aria-label'),
  );

async function swipe(label: string, x: number) {
  const shell = host
    .querySelector(`.body-history-goal-divider[aria-label$="${label}"]`)!
    .closest<HTMLElement>('.set-swipe-shell')!;
  expect(shell.classList).toContain('body-goal-swipe');
  shell.setPointerCapture = vi.fn();
  shell.hasPointerCapture = vi.fn().mockReturnValue(false);
  await act(async () => {
    for (const [type, clientX] of [
      ['pointerdown', 220],
      ['pointermove', 220 + x],
      ['pointerup', 220 + x],
    ] as const) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, {
        pointerId: 1,
        isPrimary: true,
        pointerType: 'touch',
        clientX,
        clientY: 10,
      });
      shell.dispatchEvent(event);
    }
  });
  await act(async () => vi.advanceTimersByTimeAsync(300));
}

const toast = () => document.querySelector<HTMLElement>('.undo-toast');

it('swipes a goal away with Undo, then deletes it once the Undo window closes', async () => {
  const remove = vi.spyOn(api, 'deleteBodyWeightGoal').mockResolvedValue(undefined);
  const onDataChange = await mount();
  expect(dividers()).toEqual([
    expect.stringContaining('Gain to 85 kg'),
    expect.stringContaining('Lose to 82 kg'),
  ]);

  await swipe('Gain to 85 kg', -30);
  expect(dividers()).toHaveLength(2);

  await swipe('Gain to 85 kg', -160);
  expect(dividers()).toEqual([expect.stringContaining('Lose to 82 kg')]);
  expect(toast()?.textContent).toContain('Goal removed');
  expect(remove).not.toHaveBeenCalled();

  await act(async () => toast()!.querySelector<HTMLButtonElement>('.undo-toast-action')!.click());
  expect(dividers()).toHaveLength(2);
  expect(toast()).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(GOAL_UNDO_MS));
  expect(remove).not.toHaveBeenCalled();

  await swipe('Gain to 85 kg', -160);
  await act(async () => vi.advanceTimersByTimeAsync(GOAL_UNDO_MS));
  expect(remove).toHaveBeenCalledExactlyOnceWith('gain');
  expect(onDataChange).toHaveBeenCalledTimes(1);
  expect(toast()).toBeNull();
  expect(dividers()).toEqual([expect.stringContaining('Lose to 82 kg')]);
});

it('deletes the pending goal at once when another is swiped or the popup is dismissed', async () => {
  const remove = vi.spyOn(api, 'deleteBodyWeightGoal').mockResolvedValue(undefined);
  await mount();
  await swipe('Gain to 85 kg', -160);
  await swipe('Lose to 82 kg', -160);
  expect(remove).toHaveBeenCalledExactlyOnceWith('gain');
  expect(dividers()).toEqual([]);
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Dismiss goal notification"]')!.click(),
  );
  expect(remove).toHaveBeenLastCalledWith('lose');
  expect(toast()).toBeNull();
});

it('keeps the removal when leaving the screen during the Undo window', async () => {
  const remove = vi.spyOn(api, 'deleteBodyWeightGoal').mockResolvedValue(undefined);
  await mount();
  await swipe('Lose to 82 kg', -160);
  await act(async () => root.unmount());
  expect(remove).toHaveBeenCalledExactlyOnceWith('lose');
  root = createRoot(host);
});

it('puts the goal back with an error when the delete fails', async () => {
  vi.spyOn(api, 'deleteBodyWeightGoal').mockRejectedValue(new Error('Offline'));
  await mount();
  await swipe('Lose to 82 kg', -160);
  expect(dividers()).toHaveLength(1);
  await act(async () => vi.advanceTimersByTimeAsync(GOAL_UNDO_MS));
  expect(dividers()).toHaveLength(2);
  expect(host.textContent).toContain('Could not remove this goal. It has been restored.');
});
