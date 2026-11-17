import { useEffect, useRef, type RefObject } from 'react';

/** Claim downward drags before mobile browsers turn them into overscroll. */
export function useSheetDismiss(
  ref: RefObject<HTMLDialogElement | null>,
  enabled: boolean,
  onClose: () => void,
) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!enabled || !dialog) return;
    let gesture: { id: number; x: number; y: number; dragging: boolean } | null = null;
    let suppressClick = false;

    const reset = () => {
      gesture = null;
      dialog.classList.remove('sheet-dragging');
      dialog.style.removeProperty('--sheet-offset');
    };
    const begin = (id: number, x: number, y: number, target: EventTarget | null) => {
      reset();
      suppressClick = false;
      if (!(target instanceof Element) || !dialog.contains(target)) return;
      // The sticky header is always draggable. Content only drags at its scroll boundary.
      if (!target.closest('header')) {
        for (let node: Element | null = target; node; node = node.parentElement) {
          if (node.scrollTop > 0) return;
          if (node === dialog) break;
        }
      }
      gesture = { id, x, y, dragging: false };
    };
    const move = (x: number, y: number) => {
      if (!gesture) return false;
      const dx = x - gesture.x;
      const dy = y - gesture.y;
      if (!gesture.dragging) {
        if (Math.hypot(dx, dy) < 8) return false;
        if (dy <= 0 || dy < Math.abs(dx) * 1.2) {
          reset();
          return false;
        }
        gesture.dragging = true;
        suppressClick = true;
        dialog.classList.add('sheet-dragging');
      }
      dialog.style.setProperty('--sheet-offset', `${Math.max(0, dy)}px`);
      return true;
    };
    const finish = (x: number, y: number) => {
      if (!gesture) return false;
      const dragged = gesture.dragging;
      const dismiss = dragged && y - gesture.y >= 72 && y - gesture.y > Math.abs(x - gesture.x);
      reset();
      if (dismiss) close.current();
      return dragged;
    };
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return reset();
      const touch = event.touches[0];
      begin(touch.identifier, touch.clientX, touch.clientY, event.target);
    };
    const trackedTouch = (event: TouchEvent) =>
      Array.from(event.changedTouches).find((touch) => touch.identifier === gesture?.id);
    const touchMove = (event: TouchEvent) => {
      const touch = trackedTouch(event);
      if (touch && move(touch.clientX, touch.clientY) && event.cancelable) event.preventDefault();
    };
    const touchEnd = (event: TouchEvent) => {
      const touch = trackedTouch(event);
      if (touch && finish(touch.clientX, touch.clientY) && event.cancelable) event.preventDefault();
    };
    const pointerStart = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (!event.isPrimary || event.button !== 0) return reset();
      begin(event.pointerId, event.clientX, event.clientY, event.target);
    };
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.pointerId !== gesture?.id) return;
      if (move(event.clientX, event.clientY)) event.preventDefault();
    };
    const pointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && event.pointerId === gesture?.id)
        finish(event.clientX, event.clientY);
    };
    const pointerCancel = (event: PointerEvent) => {
      // Browsers may cancel the pointer stream while the touch stream remains active.
      if (event.pointerType !== 'touch' && event.pointerId === gesture?.id) reset();
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const active = { passive: false };
    dialog.addEventListener('touchstart', touchStart, active);
    dialog.addEventListener('touchmove', touchMove, active);
    dialog.addEventListener('touchend', touchEnd, active);
    dialog.addEventListener('touchcancel', reset);
    dialog.addEventListener('pointerdown', pointerStart);
    window.addEventListener('pointermove', pointerMove, active);
    window.addEventListener('pointerup', pointerEnd);
    window.addEventListener('pointercancel', pointerCancel);
    dialog.addEventListener('click', click, true);
    window.addEventListener('blur', reset);
    return () => {
      reset();
      dialog.removeEventListener('touchstart', touchStart);
      dialog.removeEventListener('touchmove', touchMove);
      dialog.removeEventListener('touchend', touchEnd);
      dialog.removeEventListener('touchcancel', reset);
      dialog.removeEventListener('pointerdown', pointerStart);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerEnd);
      window.removeEventListener('pointercancel', pointerCancel);
      dialog.removeEventListener('click', click, true);
      window.removeEventListener('blur', reset);
    };
  }, [enabled, ref]);
}
