import { useTips } from './Tips';
import { useEffect, useRef } from 'react';
import {
  completesEdgeSwipe,
  EDGE_SWIPE_DISTANCE_PX,
  EDGE_SWIPE_START_PX,
  edgeSwipeIntent,
} from './edgeSwipe';

function isStandalonePwa(): boolean {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches || iosNavigator.standalone === true
  );
}

function gestureBlocked(): boolean {
  return Boolean(document.querySelector('[aria-modal="true"], body.chart-fullscreen-open'));
}

/**
 * Installed PWAs have no browser back gesture, so a drag from the left edge walks back through
 * the app's own history entries. Touch input uses touch events so a horizontal edge drag can be
 * claimed with preventDefault before the browser turns it into a pan or overscroll gesture;
 * mouse and pen input use pointer events.
 */
export function EdgeSwipeBack({ onBack, enabled }: { onBack: () => void; enabled: boolean }) {
  const { learn } = useTips();
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!enabled || !isStandalonePwa()) return;

    let trackingId: number | null = null;
    let startX = 0;
    let startY = 0;
    let horizontal = false;
    let ready = false;
    const root = document.documentElement;

    const reset = () => {
      trackingId = null;
      horizontal = false;
      ready = false;
      root.classList.remove('edge-swipe-active', 'edge-swipe-ready');
      root.style.removeProperty('--edge-swipe-progress');
    };

    const begin = (id: number, x: number, y: number) => {
      if (x > EDGE_SWIPE_START_PX || gestureBlocked()) return;
      trackingId = id;
      startX = x;
      startY = y;
      horizontal = false;
    };

    /** Returns true while the gesture is a claimed horizontal back swipe. */
    const move = (x: number, y: number): boolean => {
      const deltaX = x - startX;
      const deltaY = y - startY;
      if (!horizontal) {
        const intent = edgeSwipeIntent(deltaX, deltaY);
        if (intent === 'cancel') {
          reset();
          return false;
        }
        if (intent === 'undecided') return false;
        horizontal = true;
        root.classList.add('edge-swipe-active');
      }
      const progress = Math.max(0, Math.min(1, deltaX / EDGE_SWIPE_DISTANCE_PX));
      root.style.setProperty('--edge-swipe-progress', String(progress));
      const nextReady = completesEdgeSwipe(deltaX, deltaY);
      if (nextReady !== ready) {
        ready = nextReady;
        root.classList.toggle('edge-swipe-ready', ready);
        if (ready) navigator.vibrate?.(8);
      }
      return true;
    };

    const finish = (x: number, y: number) => {
      const completed = horizontal && completesEdgeSwipe(x - startX, y - startY);
      reset();
      if (completed) {
        learn('back');
        onBackRef.current();
      }
    };

    const trackedTouch = (list: TouchList) => {
      for (let index = 0; index < list.length; index += 1) {
        if (list[index].identifier === trackingId) return list[index];
      }
      return null;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const touch = event.touches[0];
      begin(touch.identifier, touch.clientX, touch.clientY);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (trackingId === null) return;
      const touch = trackedTouch(event.changedTouches);
      if (!touch) return;
      if (move(touch.clientX, touch.clientY) && event.cancelable) event.preventDefault();
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (trackingId === null) return;
      const touch = trackedTouch(event.changedTouches);
      if (touch) finish(touch.clientX, touch.clientY);
    };

    const onTouchCancel = () => reset();

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || !event.isPrimary) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      begin(event.pointerId, event.clientX, event.clientY);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.pointerId !== trackingId) return;
      if (move(event.clientX, event.clientY)) event.preventDefault();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.pointerId !== trackingId) return;
      finish(event.clientX, event.clientY);
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && event.pointerId === trackingId) reset();
    };

    const capture = { capture: true } as const;
    const activeCapture = { capture: true, passive: false } as const;
    window.addEventListener('touchstart', onTouchStart, activeCapture);
    window.addEventListener('touchmove', onTouchMove, activeCapture);
    window.addEventListener('touchend', onTouchEnd, capture);
    window.addEventListener('touchcancel', onTouchCancel, capture);
    window.addEventListener('pointerdown', onPointerDown, capture);
    window.addEventListener('pointermove', onPointerMove, activeCapture);
    window.addEventListener('pointerup', onPointerUp, capture);
    window.addEventListener('pointercancel', onPointerCancel, capture);
    return () => {
      reset();
      window.removeEventListener('touchstart', onTouchStart, capture);
      window.removeEventListener('touchmove', onTouchMove, capture);
      window.removeEventListener('touchend', onTouchEnd, capture);
      window.removeEventListener('touchcancel', onTouchCancel, capture);
      window.removeEventListener('pointerdown', onPointerDown, capture);
      window.removeEventListener('pointermove', onPointerMove, capture);
      window.removeEventListener('pointerup', onPointerUp, capture);
      window.removeEventListener('pointercancel', onPointerCancel, capture);
    };
  }, [enabled, learn]);

  return (
    <div className="edge-swipe-indicator" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M15 5.5 8.5 12l6.5 6.5" />
      </svg>
    </div>
  );
}
