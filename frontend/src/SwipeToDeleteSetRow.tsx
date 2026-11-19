import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { motionReduced } from './motion';
import { takeSetAdded } from './setRowEntrance';
import { completesSetRowDeleteSwipe, setRowSwipeOffset, setRowSwipeProgress } from './setRowSwipe';

const SWIPE_AXIS_LOCK_PX = 8;
const DELETE_ANIMATION_MS = 280;
const ADD_ANIMATION_MS = 560;
const ADD_EASING = 'cubic-bezier(0.22, 0.72, 0.1, 1)';

interface ActivePointer {
  id: number;
  startX: number;
  startY: number;
  horizontal: boolean;
  /** The reorder handle the touch started on, if any. */
  handle: HTMLElement | null;
}

export function SwipeToDeleteSetRow({
  children,
  label,
  className = '',
  flipKey,
  disabled = false,
  overlayOpen = false,
  onDelete,
}: {
  children: ReactNode;
  label: string;
  /** Extra classes for the row, such as a goal divider in body history. */
  className?: string;
  /** Lets list reorder animations track this row. */
  flipKey?: string;
  disabled?: boolean;
  overlayOpen?: boolean;
  onDelete: () => void;
}) {
  const pointerRef = useRef<ActivePointer | null>(null);
  const deleteTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const onDeleteRef = useRef(onDelete);
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  // A newly added set grows open and drops out from under the set above it; rows that mount
  // with the workout, or move when sets are reordered, stay put.
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell || !takeSetAdded(flipKey) || motionReduced() || !shell.animate) return;
    const height = shell.offsetHeight;
    shell.animate(
      [
        { height: '0px', opacity: 0 },
        { height: `${height}px`, opacity: 1 },
      ],
      {
        duration: ADD_ANIMATION_MS,
        easing: ADD_EASING,
      },
    );
    (shell.firstElementChild as HTMLElement | null)?.animate(
      [{ transform: 'translateY(-55%)' }, { transform: 'translateY(0)' }],
      { duration: ADD_ANIMATION_MS, easing: ADD_EASING },
    );
    // Only on mount: a set is new once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onDeleteRef.current = onDelete;
  }, [onDelete]);

  useEffect(
    () => () => {
      if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current);
    },
    [],
  );

  function resetSwipe() {
    pointerRef.current = null;
    setDragging(false);
    setOffsetX(0);
  }

  // Runs in the capture phase, so a touch that starts on the reorder handle (which stops the
  // event from bubbling) can still swipe: the handle needs a hold before it drags.
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || deleting || !event.isPrimary || event.pointerType === 'mouse') return;

    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      horizontal: false,
      handle: (event.target as HTMLElement).closest<HTMLElement>('.set-drag-handle'),
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const deltaX = event.clientX - pointer.startX;
    const deltaY = event.clientY - pointer.startY;

    if (!pointer.horizontal) {
      // Held long enough to start reordering: the handle owns this touch now. (Pointer capture
      // can't tell, as a touch is implicitly captured by the element it starts on.)
      if (pointer.handle?.dataset.armed) {
        resetSwipe();
        return;
      }
      if (Math.abs(deltaY) > SWIPE_AXIS_LOCK_PX && Math.abs(deltaY) > Math.abs(deltaX)) {
        resetSwipe();
        return;
      }
      if (deltaX > -SWIPE_AXIS_LOCK_PX || Math.abs(deltaX) <= Math.abs(deltaY)) return;
      pointer.horizontal = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    setOffsetX(setRowSwipeOffset(deltaX));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const deltaX = event.clientX - pointer.startX;
    const deltaY = event.clientY - pointer.startY;
    const wasHorizontal = pointer.horizontal;
    pointerRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!wasHorizontal) return;

    event.preventDefault();
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    if (!completesSetRowDeleteSwipe(deltaX, deltaY)) {
      setDragging(false);
      setOffsetX(0);
      return;
    }

    setDragging(false);
    setDeleting(true);
    setOffsetX(-(event.currentTarget.getBoundingClientRect().width + 48));
    deleteTimerRef.current = window.setTimeout(() => onDeleteRef.current(), DELETE_ANIMATION_MS);
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerRef.current?.id !== event.pointerId) return;
    resetSwipe();
  }

  const style = {
    '--set-swipe-x': `${offsetX}px`,
    '--set-swipe-progress': setRowSwipeProgress(offsetX),
  } as CSSProperties;

  return (
    <div
      ref={shellRef}
      className={`set-swipe-shell ${className} ${dragging ? 'is-dragging' : ''} ${deleting ? 'is-deleting' : ''} ${disabled ? 'is-disabled' : ''} ${overlayOpen ? 'has-open-overlay' : ''}`}
      data-flip-key={flipKey}
      style={style}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDownCapture={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div className="set-swipe-delete-layer" aria-hidden="true">
        <span className="trash-can-icon" />
        <strong>Delete</strong>
      </div>
      <div className="set-swipe-content">{children}</div>
      <span className="sr-only">Swipe left to delete {label}</span>
    </div>
  );
}
