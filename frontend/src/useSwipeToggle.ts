import { useRef, useState, type PointerEvent } from 'react';
import { DRAG_SLOP, dragOpenness, settleOpen } from './drawerGesture';

interface Drag {
  pointerId: number;
  startY: number;
  from: number;
  full: number;
  moved: boolean;
  lastY: number;
  lastTime: number;
  velocity: number;
}

/** A finger resting this long before lifting ends a flick. */
const FLICK_WINDOW_MS = 120;
const NONE = Symbol('open');

/**
 * A handle that opens and shuts a panel: it follows the finger while dragged, settles open or shut
 * on release (a quick flick goes the way it was flicked), and a tap toggles it.
 *
 * `opens` is the swipe direction that opens the panel. `full` is the panel's open height in
 * pixels. The panel opens again whenever `resetKey` changes.
 */
export function useSwipeToggle({
  opens,
  full,
  resetKey,
}: {
  opens: 'down' | 'up';
  full: number;
  resetKey?: unknown;
}) {
  const [closedFor, setClosedFor] = useState<unknown>(NONE);
  const [dragged, setDragged] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const skipClick = useRef(false);
  const open = closedFor !== resetKey;
  const setOpen = (next: boolean) => setClosedFor(next ? NONE : resetKey);
  const sign = opens === 'down' ? 1 : -1;

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    skipClick.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      from: open ? 1 : 0,
      full,
      moved: false,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dy = event.clientY - current.startY;
    if (!current.moved && Math.abs(dy) < DRAG_SLOP) return;
    current.moved = true;
    const elapsed = event.timeStamp - current.lastTime;
    if (elapsed > 0) current.velocity = (event.clientY - current.lastY) / elapsed;
    current.lastY = event.clientY;
    current.lastTime = event.timeStamp;
    setDragged(dragOpenness(current.from, sign * dy, current.full));
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!current.moved) return;
    // The click that follows a drag is not a tap.
    skipClick.current = true;
    const resting = event.timeStamp - current.lastTime > FLICK_WINDOW_MS;
    setOpen(
      settleOpen(
        dragOpenness(current.from, sign * (event.clientY - current.startY), current.full),
        resting ? 0 : sign * current.velocity,
      ),
    );
    setDragged(null);
  }

  function onPointerCancel() {
    drag.current = null;
    setDragged(null);
  }

  function onClick() {
    if (skipClick.current) {
      skipClick.current = false;
      return;
    }
    setOpen(!open);
  }

  return {
    open,
    /** How open the panel is while dragged, from 0 to 1, or null when not dragging. */
    dragged,
    handleProps: {
      'aria-expanded': open,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClick,
    },
  };
}
