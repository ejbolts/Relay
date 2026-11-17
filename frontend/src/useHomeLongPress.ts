import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

/** Keep scrolling and ordinary taps native; only a stationary half-second hold edits Home. */
export function useHomeLongPress(onEdit?: () => void) {
  const callback = useRef(onEdit);
  const pending = useRef<{
    timer: ReturnType<typeof setTimeout>;
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const consumed = useRef(false);

  function cancel() {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
  }

  useEffect(() => {
    callback.current = onEdit;
    if (!onEdit) cancel();
  }, [onEdit]);

  useEffect(() => {
    const end = (event: PointerEvent) => {
      if (event.pointerId === pending.current?.pointerId) cancel();
    };
    const hide = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener('pointerdown', cancelSecondary);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('scroll', cancel, true);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', hide);
    function cancelSecondary(event: PointerEvent) {
      if (!event.isPrimary) cancel();
    }
    return () => {
      cancel();
      window.removeEventListener('pointerdown', cancelSecondary);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('scroll', cancel, true);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  return {
    onPointerDownCapture(event: ReactPointerEvent<HTMLDivElement>) {
      cancel();
      consumed.current = false;
      if (!callback.current || !event.isPrimary || event.button !== 0) return;
      const target = event.target as Element;
      if (
        !target.closest('[data-home-section]') ||
        target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
      )
        return;
      pending.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
          pending.current = null;
          consumed.current = true;
          callback.current?.();
        }, 500),
      };
    },
    onPointerMoveCapture(event: ReactPointerEvent<HTMLDivElement>) {
      const hold = pending.current;
      if (
        hold?.pointerId === event.pointerId &&
        Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 10
      )
        cancel();
    },
    onPointerLeave(event: ReactPointerEvent<HTMLDivElement>) {
      if (pending.current?.pointerId === event.pointerId) cancel();
    },
    onPointerUpCapture(event: ReactPointerEvent<HTMLDivElement>) {
      if (pending.current?.pointerId === event.pointerId) cancel();
      if (consumed.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    onPointerCancelCapture: cancel,
    onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
      if (consumed.current && event.detail > 0) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    onContextMenuCapture(event: React.MouseEvent<HTMLDivElement>) {
      if (pending.current || consumed.current) event.preventDefault();
    },
  };
}
