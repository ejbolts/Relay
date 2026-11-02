import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

const HOLD_MS = 500;
const HOLD_SLOP_PX = 8;

export function SetDragHandle({
  setNumber,
  disabled,
  onStart,
  onPointerMove,
  onPointerUp,
  onCancel,
  onMoveEarlier,
  onMoveLater,
}: {
  setNumber: number;
  disabled: boolean;
  onStart: (handle: HTMLButtonElement, pointerId: number) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onCancel: () => void;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
}) {
  const handleRef = useRef<HTMLButtonElement>(null);
  const pressRef = useRef<{ id: number; active: boolean } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  function reset() {
    const press = pressRef.current;
    pressRef.current = null;
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (press && handleRef.current?.hasPointerCapture(press.id)) {
      handleRef.current.releasePointerCapture(press.id);
    }
    return press;
  }

  function cancel() {
    const press = reset();
    if (press?.active) cancelRef.current();
  }

  useEffect(() => {
    const handle = handleRef.current;
    // Allow native scrolling until armed. Once armed, keep the same touch gesture
    // available for dragging rather than handing it to the browser's pan handler.
    const touchMove = (event: TouchEvent) => {
      if (pressRef.current?.active && event.cancelable) event.preventDefault();
    };
    handle?.addEventListener('touchmove', touchMove, { passive: false });
    return () => {
      pressRef.current = null;
      cleanupRef.current?.();
      handle?.removeEventListener('touchmove', touchMove);
    };
  }, []);

  useEffect(() => {
    if (disabled) cancel();
  });

  function begin(event: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled || !event.isPrimary || event.button !== 0) return;
    cancel();
    event.stopPropagation();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const press = { id: event.pointerId, active: false };
    pressRef.current = press;
    const timer = window.setTimeout(() => {
      if (pressRef.current !== press) return;
      press.active = true;
      onStart(handle, press.id);
    }, HOLD_MS);
    const move = (e: PointerEvent) => {
      if (e.pointerId !== press.id || press.active) return;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > HOLD_SLOP_PX) cancel();
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId === press.id && !press.active) cancel();
    };
    const anotherPointer = (e: PointerEvent) => {
      if (e.pointerId !== press.id) cancel();
    };
    const scroll = () => {
      if (!press.active) cancel();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    const hidden = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('pointerdown', anotherPointer);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', escape);
    document.addEventListener('visibilitychange', hidden);
    cleanupRef.current = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('pointerdown', anotherPointer);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', escape);
      document.removeEventListener('visibilitychange', hidden);
    };
  }

  return (
    <button
      ref={handleRef}
      type="button"
      className="set-drag-handle"
      aria-label={`Drag set ${setNumber} to reorder`}
      title="Hold for 0.5 seconds to drag. Use arrow keys to reorder."
      disabled={disabled}
      onPointerDown={begin}
      onPointerMove={(event) => {
        if (pressRef.current?.active && pressRef.current.id === event.pointerId)
          onPointerMove(event);
      }}
      onPointerUp={(event) => {
        if (pressRef.current?.id !== event.pointerId) return;
        if (pressRef.current.active) onPointerUp(event);
        reset();
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          onMoveEarlier();
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          onMoveLater();
        }
      }}
    >
      <span className="set-drag-grip" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((dot) => (
          <i key={dot} />
        ))}
      </span>
    </button>
  );
}
