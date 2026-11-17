// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MuscleSetsCard } from './MuscleSetsCard';
import type { WeeklySets } from './types';

let root: Root;
let host: HTMLDivElement;
const data: WeeklySets = {
  week_start: '2026-10-19',
  week_end: '2026-10-25',
  raw_sets: 2,
  effective_sets: 2,
  unrated_sets: 0,
  low_rpe_sets: 0,
  rpe_logging_percent: 100,
  muscle_groups: [
    {
      muscle_group: 'Rear deltoids',
      raw_sets: 2,
      effective_sets: 2,
      average_rpe: 8,
      contributions: [
        {
          workout_id: 'pull',
          workout_name: 'Pull workout',
          workout_date: '2026-10-18',
          movement_id: 'row',
          exercise_id: 'row',
          exercise_name: 'Seated Cable Row',
          working_sets: 4,
          credit_per_set: 0.5,
          set_credits: 2,
        },
      ],
    },
  ],
};
beforeEach(async () => {
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
  await act(async () =>
    root.render(<MuscleSetsCard weeklySets={data} goal={10} onOpenWorkout={vi.fn()} />),
  );
  await act(async () => host.querySelector<HTMLButtonElement>('.muscle-name-button')!.click());
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function sheet() {
  return document.querySelector<HTMLDialogElement>('dialog')!;
}
async function touch(target: Element, type: string, x: number, y: number, count = 1) {
  const point = { identifier: 1, clientX: x, clientY: y };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    touches: type === 'touchend' ? [] : Array(count).fill(point),
    changedTouches: [point],
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}
it('tracks a downward touch from the handle and dismisses on release', async () => {
  const dialog = sheet();
  const header = dialog.querySelector('header')!;
  expect(dialog.textContent).not.toContain('Contributing exercises');
  await touch(header, 'touchstart', 180, 300);
  const move = await touch(header, 'touchmove', 185, 390);
  expect(move.defaultPrevented).toBe(true);
  expect(dialog.style.getPropertyValue('--sheet-offset')).toBe('90px');
  expect(dialog.open).toBe(true);
  const end = await touch(header, 'touchend', 185, 390);
  expect(end.defaultPrevented).toBe(true);
  expect(sheet()).toBeNull();
});
it('snaps back a short pull and suppresses its click on an exercise', async () => {
  const dialog = sheet();
  const exercise = dialog.querySelector('.muscle-contribution-list button')!;
  await touch(exercise, 'touchstart', 180, 300);
  await touch(exercise, 'touchmove', 180, 330);
  await touch(exercise, 'touchend', 180, 330);
  expect(dialog.style.getPropertyValue('--sheet-offset')).toBe('');
  expect(dialog.classList.contains('sheet-dragging')).toBe(false);
  const click = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
  await act(async () => {
    exercise.dispatchEvent(click);
  });
  expect(click.defaultPrevented).toBe(true);
  expect(sheet()).toBe(dialog);
});
it.each([
  [180, 200],
  [280, 310],
])('leaves upward and horizontal gestures native (%i, %i)', async (x, y) => {
  const body = sheet().querySelector('.muscle-sheet-body')!;
  await touch(body, 'touchstart', 180, 300);
  const event = await touch(body, 'touchmove', x, y);
  await touch(body, 'touchend', x, y);
  expect(event.defaultPrevented).toBe(false);
  expect(sheet()).not.toBeNull();
});
it('preserves content scrolling and lets the sticky header dismiss a scrolled sheet', async () => {
  const dialog = sheet();
  dialog.scrollTop = 100;
  const body = dialog.querySelector('.muscle-sheet-body')!;
  await touch(body, 'touchstart', 180, 300);
  expect((await touch(body, 'touchmove', 180, 400)).defaultPrevented).toBe(false);
  await touch(body, 'touchend', 180, 400);
  expect(sheet()).toBe(dialog);
  const header = dialog.querySelector('header')!;
  await touch(header, 'touchstart', 180, 300);
  await touch(header, 'touchmove', 180, 400);
  await touch(header, 'touchend', 180, 400);
  expect(sheet()).toBeNull();
});
it.each(['touchcancel', 'second-touch'])('resets an interrupted drag (%s)', async (reason) => {
  const header = sheet().querySelector('header')!;
  await touch(header, 'touchstart', 180, 300);
  await touch(header, 'touchmove', 180, 400);
  await touch(header, reason === 'second-touch' ? 'touchstart' : reason, 180, 400, 2);
  await touch(header, 'touchend', 180, 400);
  expect(sheet()).not.toBeNull();
  expect(sheet().style.getPropertyValue('--sheet-offset')).toBe('');
});

it('keeps keyboard dismissal available after a short touch pull', async () => {
  const header = sheet().querySelector('header')!;
  await touch(header, 'touchstart', 180, 300);
  await touch(header, 'touchmove', 180, 330);
  await touch(header, 'touchend', 180, 330);
  await act(async () => sheet().querySelector<HTMLButtonElement>('.popup-dialog-close')!.click());
  expect(sheet()).toBeNull();
});

it('keeps tracking touch input if the browser cancels its parallel pointer stream', async () => {
  const header = sheet().querySelector('header')!;
  await touch(header, 'touchstart', 180, 300);
  const cancel = new Event('pointercancel', { bubbles: true });
  Object.assign(cancel, { pointerType: 'touch', pointerId: 7 });
  await act(async () => {
    header.dispatchEvent(cancel);
  });
  await touch(header, 'touchmove', 180, 400);
  await touch(header, 'touchend', 180, 400);
  expect(sheet()).toBeNull();
});
