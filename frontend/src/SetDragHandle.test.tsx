// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SetDragHandle } from './SetDragHandle';

let root: Root, host: HTMLDivElement;
const start = vi.fn();
const move = vi.fn();
const finish = vi.fn();
const cancel = vi.fn();
const earlier = vi.fn();
const later = vi.fn();
const handle = () => host.querySelector('button')!;
async function render(disabled = false) {
  await act(async () =>
    root.render(
      <SetDragHandle
        setNumber={1}
        disabled={disabled}
        onStart={start}
        onPointerMove={move}
        onPointerUp={finish}
        onCancel={cancel}
        onMoveEarlier={earlier}
        onMoveLater={later}
      />,
    ),
  );
}
async function pointer(type: string, overrides = {}, target: EventTarget = handle()) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 100,
    clientY: 100,
    ...overrides,
  });
  for (const [key, value] of Object.entries({
    pointerId: 1,
    isPrimary: true,
    pointerType: 'touch',
    ...overrides,
  }))
    Object.defineProperty(event, key, { value });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await render();
  handle().hasPointerCapture = vi.fn().mockReturnValue(false);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('arms only at 500ms, tolerates jitter and then forwards drag and drop', async () => {
  await pointer('pointerdown');
  await pointer('pointermove', { clientX: 104 });
  await advance(499);
  expect(start).not.toHaveBeenCalled();
  expect(move).not.toHaveBeenCalled();
  await advance(1);
  expect(start).toHaveBeenCalledExactlyOnceWith(handle(), 1);
  await pointer('pointermove', { clientY: 180 });
  expect(move).toHaveBeenCalledOnce();
  await pointer('pointerup');
  expect(finish).toHaveBeenCalledOnce();
  await advance(500);
  expect(start).toHaveBeenCalledOnce();
});

it.each([
  'early release',
  'move',
  'scroll',
  'cancel',
  'blur',
  'second pointer',
  'outside release',
  'Escape',
  'disabled',
  'unmount',
])('cancels an unarmed hold on %s', async (reason) => {
  await pointer('pointerdown');
  await advance(250);
  if (reason === 'early release') await pointer('pointerup');
  if (reason === 'move') await pointer('pointermove', { clientY: 109 }, window);
  if (reason === 'scroll') window.dispatchEvent(new Event('scroll'));
  if (reason === 'cancel') await pointer('pointercancel');
  if (reason === 'blur') window.dispatchEvent(new Event('blur'));
  if (reason === 'second pointer')
    await pointer('pointerdown', { pointerId: 2, isPrimary: false }, window);
  if (reason === 'outside release') await pointer('pointerup', {}, window);
  if (reason === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  if (reason === 'disabled') await render(true);
  if (reason === 'unmount') await act(async () => root.render(null));
  await advance(500);
  expect(start).not.toHaveBeenCalled();
  expect(finish).not.toHaveBeenCalled();
});

it('keeps touch scrolling native before arming and prevents it during the held drag', async () => {
  await pointer('pointerdown');
  const touch = () => {
    const event = new Event('touchmove', { bubbles: true, cancelable: true });
    handle().dispatchEvent(event);
    return event;
  };
  expect(touch().defaultPrevented).toBe(false);
  await advance(500);
  expect(touch().defaultPrevented).toBe(true);
  await pointer('pointercancel');
  expect(cancel).toHaveBeenCalledOnce();
  expect(touch().defaultPrevented).toBe(false);
  await pointer('pointerup');
  expect(finish).not.toHaveBeenCalled();
});

it.each(['pointercancel', 'lostpointercapture', 'blur', 'Escape'])(
  'clears the armed state without dropping on %s',
  async (reason) => {
    await pointer('pointerdown');
    await advance(500);
    if (reason === 'blur') window.dispatchEvent(new Event('blur'));
    else if (reason === 'Escape')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    else await pointer(reason);
    expect(cancel).toHaveBeenCalledOnce();
    await pointer('pointerup');
    expect(finish).not.toHaveBeenCalled();
  },
);

it('preserves immediate keyboard reordering and ignores nonprimary and secondary presses', async () => {
  await pointer('pointerdown', { button: 2 });
  await advance(500);
  await pointer('pointerdown', { isPrimary: false });
  await advance(500);
  expect(start).not.toHaveBeenCalled();
  await act(async () => {
    handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  expect(earlier).toHaveBeenCalledOnce();
  expect(later).toHaveBeenCalledOnce();
});
