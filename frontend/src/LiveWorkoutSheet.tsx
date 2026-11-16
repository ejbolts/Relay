import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motionReduced } from './motion';
import { LiveWorkoutSheetContext } from './liveWorkoutSheetContext';
import './liveWorkout.css';

/** Opening the app straight into a workout shows it in place; later openings slide up. */
const OPEN_ANIMATION_AFTER_LOAD_MS = 1500;
const OPEN_ANIMATION_MS = 420;

/** A mounted workout with its own scroll position, sliding over Home without stopping its clocks. */
export function LiveWorkoutSheet({
  active,
  enabled,
  onMinimise,
  children,
}: {
  active: boolean;
  enabled: boolean;
  onMinimise: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onMinimise);
  close.current = onMinimise;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const [opening, setOpening] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closingRef = useRef(false);
  const timer = useRef<number | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  // Before the first paint, so the sheet never shows in place and then jumps down to slide up.
  useLayoutEffect(() => {
    if (!enabled || !active) return;
    if (motionReduced() || performance.now() < OPEN_ANIMATION_AFTER_LOAD_MS) return;
    setOpening(true);
    openTimer.current = window.setTimeout(() => setOpening(false), OPEN_ANIMATION_MS + 80);
    return () => {
      if (openTimer.current !== null) window.clearTimeout(openTimer.current);
      openTimer.current = null;
      setOpening(false);
    };
  }, [active, enabled]);

  useEffect(() => {
    const element = dialog.current;
    if (!enabled || !active || !element) return;
    setOffset(0);
    setClosing(false);
    setDragging(false);
    closingRef.current = false;
    element.querySelector<HTMLButtonElement>('.workout-sheet-grab')?.focus({ preventScroll: true });
    // Keep this lock separate from nested dialogs' saved inline overflow values.
    const alreadyLocked = document.body.classList.contains('live-workout-sheet-open');
    document.body.classList.add('live-workout-sheet-open');
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      closingRef.current = false;
      gesture.current = null;
      if (!alreadyLocked) document.body.classList.remove('live-workout-sheet-open');
    };
  }, [active, enabled]);

  function finish() {
    if (!closingRef.current) return;
    closingRef.current = false;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    close.current();
  }
  function minimise() {
    if (closingRef.current) return;
    gesture.current = null;
    setDragging(false);
    closingRef.current = true;
    setClosing(true);
    setOffset(window.innerHeight);
    if (motionReduced()) finish();
    else timer.current = window.setTimeout(finish, 320);
  }
  function cancelGesture() {
    gesture.current = null;
    setDragging(false);
    if (!closingRef.current) setOffset(0);
  }

  if (!enabled) return children;
  return (
    <LiveWorkoutSheetContext.Provider value={{ minimise }}>
      <div
        className={`live-workout-sheet-backdrop${dragging ? ' is-dragging' : ''}${opening ? ' is-opening' : ''}`}
        hidden={!active}
        aria-hidden="true"
        style={{ opacity: Math.max(0, 1 - offset / Math.max(1, window.innerHeight)) }}
        onClick={minimise}
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal={active ? true : undefined}
        hidden={!active}
        tabIndex={-1}
        className={`live-workout-sheet${dragging ? ' is-dragging' : ''}${closing ? ' is-closing' : ''}${opening ? ' is-opening' : ''}`}
        aria-label="Live workout"
        style={{ transform: `translate3d(0, ${offset}px, 0)` }}
        onKeyDown={(event) => {
          // React events from nested portal dialogs bubble through this component too.
          if (!(event.target instanceof Node) || !dialog.current?.contains(event.target)) return;
          if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            minimise();
            return;
          }
          if (event.key !== 'Tab') return;
          const items = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
            ) ?? [],
          ).filter((item) => item.getClientRects().length > 0);
          const first = items[0],
            last = items.at(-1);
          if (!first) {
            event.preventDefault();
            dialog.current?.focus();
          } else if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === dialog.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) setOpening(false);
        }}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'transform') finish();
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary) {
            cancelGesture();
            return;
          }
          if (event.button !== 0 || closingRef.current) return;
          // A drag takes over from the opening slide straight away.
          setOpening(false);
          const target = event.target as HTMLElement;
          if (!target.closest('.live-workout-header') || target.closest('[role="menu"]')) return;
          if (
            target.closest('button, input, textarea, a') &&
            !target.closest('.workout-sheet-grab')
          )
            return;
          suppressClick.current = false;
          gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          const start = gesture.current;
          if (!start || start.id !== event.pointerId) return;
          const dx = Math.abs(event.clientX - start.x),
            dy = event.clientY - start.y;
          if (dy < -12 || (dx > 12 && dx > dy)) {
            cancelGesture();
            return;
          }
          if (dy > 8) {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            suppressClick.current = true;
            setDragging(true);
            setOffset(Math.max(0, dy));
          }
        }}
        onPointerUp={(event) => {
          const start = gesture.current;
          if (!start || start.id !== event.pointerId) return;
          const dy = event.clientY - start.y;
          const threshold = Math.min(140, Math.max(72, window.innerHeight * 0.12));
          if (dy >= threshold && Math.abs(event.clientX - start.x) < dy * 0.7) minimise();
          else cancelGesture();
          window.setTimeout(() => (suppressClick.current = false), 0);
        }}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={(event) => {
          if (event.target === event.currentTarget && !closingRef.current) cancelGesture();
        }}
        onClickCapture={(event) => {
          if (suppressClick.current && event.detail !== 0) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <div className="live-workout-sheet-scroll">{children}</div>
      </div>
    </LiveWorkoutSheetContext.Provider>
  );
}
