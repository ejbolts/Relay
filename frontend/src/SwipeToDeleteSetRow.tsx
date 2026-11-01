import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { completesSetRowDeleteSwipe, setRowSwipeOffset, setRowSwipeProgress } from './setRowSwipe';

const SWIPE_AXIS_LOCK_PX = 8;
const DELETE_ANIMATION_MS = 280;

interface ActivePointer {
  id: number;
  startX: number;
  startY: number;
  horizontal: boolean;
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

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (
      disabled ||
      deleting ||
      !event.isPrimary ||
      event.pointerType === 'mouse' ||
      target.closest('.set-drag-handle, .set-actions-menu-popover')
    ) {
      return;
    }

    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      horizontal: false,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const deltaX = event.clientX - pointer.startX;
    const deltaY = event.clientY - pointer.startY;

    if (!pointer.horizontal) {
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
      className={`set-swipe-shell ${className} ${dragging ? 'is-dragging' : ''} ${deleting ? 'is-deleting' : ''} ${disabled ? 'is-disabled' : ''} ${overlayOpen ? 'has-open-overlay' : ''}`}
      data-flip-key={flipKey}
      style={style}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={onPointerDown}
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
