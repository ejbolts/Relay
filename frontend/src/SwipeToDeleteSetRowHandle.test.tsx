// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SetDragHandle } from './SetDragHandle';
import { SwipeToDeleteSetRow } from './SwipeToDeleteSetRow';

let root: Root;
let container: HTMLDivElement;
const onDelete = vi.fn();
const onStart = vi.fn();

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  onDelete.mockClear();
  onStart.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <SwipeToDeleteSetRow label="set 2" onDelete={onDelete}>
        <div className="set-details">
          <span>60 kg</span>
          <SetDragHandle
            setNumber={2}
            disabled={false}
            onStart={(handle, pointerId) => {
              onStart();
              handle.setPointerCapture(pointerId);
            }}
            onPointerMove={vi.fn()}
            onPointerUp={vi.fn()}
            onCancel={vi.fn()}
            onMoveEarlier={vi.fn()}
            onMoveLater={vi.fn()}
          />
        </div>
      </SwipeToDeleteSetRow>,
    ),
  );
  // jsdom has no pointer capture. Track it, including the implicit capture a browser gives the
  // element a touch starts on.
  const captured = new Set<string>();
  for (const element of [shell(), handle()]) {
    const key = element.className;
    element.setPointerCapture = vi.fn(() => {
      captured.clear();
      captured.add(key);
    });
    element.releasePointerCapture = vi.fn(() => captured.delete(key));
    element.hasPointerCapture = vi.fn(() => captured.has(key));
  }
  handle().addEventListener('pointerdown', () => handle().setPointerCapture(1), true);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const shell = () => container.querySelector<HTMLElement>('.set-swipe-shell')!;
const handle = () => container.querySelector<HTMLElement>('.set-drag-handle')!;

function pointer(target: Element, type: string, clientX: number, clientY = 10) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId: 1,
    isPrimary: true,
    pointerType: 'touch',
    button: 0,
    clientX,
    clientY,
  });
  target.dispatchEvent(event);
}

it('deletes when a quick swipe starts on the reorder handle at the far right', async () => {
  await act(async () => {
    pointer(handle(), 'pointerdown', 360);
    pointer(handle(), 'pointermove', 340);
    pointer(shell(), 'pointermove', 220);
    pointer(shell(), 'pointerup', 220);
  });
  await act(async () => vi.advanceTimersByTimeAsync(600));
  expect(onDelete).toHaveBeenCalledTimes(1);
  // The swipe cancelled the hold, so no reorder started.
  expect(onStart).not.toHaveBeenCalled();
});

it('leaves the touch to reordering once the handle has been held', async () => {
  await act(async () => pointer(handle(), 'pointerdown', 360));
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(onStart).toHaveBeenCalledTimes(1);
  await act(async () => {
    pointer(handle(), 'pointermove', 220, 14);
    pointer(handle(), 'pointerup', 220, 14);
  });
  await act(async () => vi.advanceTimersByTimeAsync(600));
  expect(onDelete).not.toHaveBeenCalled();
  expect(shell().style.getPropertyValue('--set-swipe-x')).toBe('0px');
  expect(handle().dataset.armed).toBeUndefined();
});
