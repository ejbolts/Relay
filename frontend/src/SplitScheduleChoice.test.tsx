// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SplitScheduleChoice } from './SplitScheduleChoice';

let root: Root;
let host: HTMLDivElement;
const onChange = vi.fn();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  onChange.mockReset();
});

const help = (label: string) =>
  host.querySelector<HTMLButtonElement>(`[aria-label="What ${label} does"]`)!;
const popover = () => host.querySelector('.routine-progression-popover');

it('explains each schedule with a short flow and keeps choosing separate', async () => {
  await act(async () => root.render(<SplitScheduleChoice value="calendar" onChange={onChange} />));
  expect(popover()).toBeNull();
  await act(async () => help('By date').click());
  expect(help('By date').getAttribute('aria-expanded')).toBe('true');
  expect(popover()?.textContent).toBe(
    'By dateSplitUpper → Lower → RestDay off after UpperUpper → Day off → Rest → Upper→ Lower is skipped',
  );
  await act(async () => help('Follow my workouts').click());
  expect(popover()?.textContent).toBe(
    'Follow my workoutsSplitUpper → Lower → RestDay off after UpperUpper → Day off → Lower → Upper→ Lower waits; the planned Rest is skipped',
  );
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => help('Follow my workouts').click());
  expect(popover()).toBeNull();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="false"]')!.click(),
  );
  expect(onChange).toHaveBeenCalledWith('workouts');
});

it('closes on Escape without closing the surrounding dialog, and on an outside tap', async () => {
  const outside = vi.fn();
  document.body.addEventListener('keydown', outside);
  await act(async () => root.render(<SplitScheduleChoice value="workouts" onChange={onChange} />));
  await act(async () => help('By date').click());
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  await act(async () => help('By date').dispatchEvent(escape));
  expect(escape.defaultPrevented).toBe(true);
  expect(outside).not.toHaveBeenCalled();
  document.body.removeEventListener('keydown', outside);
  expect(popover()).toBeNull();
  expect(document.activeElement).toBe(help('By date'));
  await act(async () => help('By date').click());
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(popover()).toBeNull();
});
