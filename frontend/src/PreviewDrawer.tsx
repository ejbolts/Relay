import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
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

/**
 * A chart that slides down from the top when it appears, with a handle underneath: swipe it up to
 * minimise the chart to the handle and give the rest of the screen more room, or down to bring it
 * back. Tapping the handle does the same.
 */
export function PreviewDrawer({
  label,
  handle,
  children,
}: {
  label: string;
  /** What stays visible on the handle while the chart is minimised. */
  handle: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  // Shut on the first frame, so the chart slides down into place.
  const [shown, setShown] = useState(false);
  const [dragged, setDragged] = useState<number | null>(null);
  const [full, setFull] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const skipClick = useRef(false);

  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const update = () => setFull(content.offsetHeight);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
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

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dy = event.clientY - current.startY;
    if (!current.moved && Math.abs(dy) < DRAG_SLOP) return;
    current.moved = true;
    const elapsed = event.timeStamp - current.lastTime;
    if (elapsed > 0) current.velocity = (event.clientY - current.lastY) / elapsed;
    current.lastY = event.clientY;
    current.lastTime = event.timeStamp;
    setDragged(dragOpenness(current.from, dy, current.full));
  }

  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!current.moved) return;
    // The click that follows a drag is not a tap.
    skipClick.current = true;
    const resting = event.timeStamp - current.lastTime > FLICK_WINDOW_MS;
    setOpen(
      settleOpen(
        dragOpenness(current.from, event.clientY - current.startY, current.full),
        resting ? 0 : current.velocity,
      ),
    );
    setDragged(null);
  }

  function pointerCancel() {
    drag.current = null;
    setDragged(null);
  }

  const openness = dragged ?? (shown && open ? 1 : 0);
  return (
    <section
      className={`machine-weights-preview${dragged === null ? '' : ' is-dragging'}`}
      aria-label={label}
      style={{ '--open': openness, '--full': `${full}px` } as CSSProperties}
    >
      <div className="machine-weights-preview-body" aria-hidden={!open}>
        <div ref={contentRef}>{children}</div>
      </div>
      <button
        type="button"
        className="machine-weights-preview-handle"
        aria-expanded={open}
        aria-label={open ? 'Minimise preview' : 'Show preview'}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerCancel}
        onClick={() => {
          if (skipClick.current) {
            skipClick.current = false;
            return;
          }
          setOpen((current) => !current);
        }}
      >
        {handle}
        <span className="machine-weights-grabber" aria-hidden="true" />
      </button>
    </section>
  );
}
