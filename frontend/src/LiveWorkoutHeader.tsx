import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Icon, type IconName } from './Icon';
import { WorkoutHeaderMeta } from './WorkoutRestTimer';
import './liveWorkout.css';

export function LiveWorkoutHeader({
  name,
  durationLabel,
  loggedSets,
  paused,
  menuButtonRef,
  onMinimise,
  onRename,
  onAdjustTime,
  onAddNote,
  onTogglePause,
  onDiscard,
}: {
  name: string;
  durationLabel: string;
  loggedSets: number;
  paused: boolean;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onMinimise: () => void;
  onRename: () => void;
  onAdjustTime?: () => void;
  onAddNote: () => void;
  onTogglePause: () => void;
  onDiscard: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pull, setPull] = useState(0);
  const root = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open]);

  const actions: Array<{ label: string; icon: IconName; run: () => void; danger?: boolean }> = [
    { label: 'Rename workout', icon: 'edit', run: onRename },
    ...(onAdjustTime
      ? [{ label: 'Adjust workout time', icon: 'timer' as const, run: onAdjustTime }]
      : []),
    { label: 'Add note', icon: 'comment', run: onAddNote },
    {
      label: paused ? 'Resume workout' : 'Pause workout',
      icon: paused ? 'play' : 'pause',
      run: onTogglePause,
    },
    { label: 'Discard workout', icon: 'close', run: onDiscard, danger: true },
  ];

  function resetGesture() {
    gesture.current = null;
    setPull(0);
  }

  return (
    <header
      ref={root}
      className={`overlay-screen-header live-workout-header${pull > 0 ? ' is-pulling' : ''}`}
      style={{ transform: pull > 0 ? `translateY(${pull * 0.25}px)` : undefined }}
      onPointerDown={(event) => {
        if (!event.isPrimary) {
          resetGesture();
          return;
        }
        if (event.button !== 0 || open) return;
        const target = event.target as HTMLElement;
        if (target.closest('button, input, textarea, a') && !target.closest('.workout-sheet-grab'))
          return;
        suppressClick.current = false;
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = Math.abs(event.clientX - start.x);
        const dy = event.clientY - start.y;
        if (dy < -12 || (dx > 12 && dx > dy)) {
          resetGesture();
          return;
        }
        if (dy > 8) {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          suppressClick.current = true;
          setPull(Math.min(dy, 96));
        }
      }}
      onPointerUp={(event) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const dy = event.clientY - start.y;
        const minimise = dy >= 72 && Math.abs(event.clientX - start.x) < dy * 0.7;
        resetGesture();
        if (minimise) onMinimise();
        // Pointer-up can synthesize a click on the handle after a drag.
        window.setTimeout(() => (suppressClick.current = false), 0);
      }}
      onPointerCancel={resetGesture}
      onLostPointerCapture={(event) => {
        // Touch initially captures the handle button. Moving capture to this header
        // emits a bubbling loss event from the button, not a cancelled header drag.
        if (event.target === event.currentTarget) resetGesture();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          menuButtonRef.current?.focus();
        }
      }}
    >
      <button
        type="button"
        className="workout-sheet-grab"
        aria-label="Minimise workout"
        onClick={() => {
          if (!suppressClick.current) onMinimise();
        }}
      >
        <span />
      </button>
      <div className="live-workout-toolbar">
        <button
          className="overlay-header-back live-workout-minimise"
          type="button"
          aria-label="Minimise live workout"
          onClick={onMinimise}
        >
          <Icon name="chevron-down" />
        </button>
        <div className="overlay-header-copy">
          <strong title={name}>{name}</strong>
          <div className="live-workout-meta">
            <WorkoutHeaderMeta durationLabel={durationLabel} paused={paused} />
            <span aria-hidden="true">·</span>
            <span>
              {loggedSets} {loggedSets === 1 ? 'set' : 'sets'}
            </span>
          </div>
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          className="live-workout-options"
          aria-label="Workout options"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <Icon name="more" />
        </button>
      </div>
      {open && (
        <div
          ref={menu}
          id={menuId}
          className="live-workout-menu"
          role="menu"
          aria-label="Workout options"
          onKeyDown={(event) => {
            const buttons = Array.from(menu.current?.querySelectorAll('button') ?? []);
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            let next: number;
            if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
            else if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = buttons.length - 1;
            else return;
            event.preventDefault();
            buttons[next]?.focus();
          }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              aria-label={action.label}
              className={action.danger ? 'danger' : undefined}
              onClick={() => {
                setOpen(false);
                menuButtonRef.current?.focus();
                action.run();
              }}
            >
              <Icon name={action.icon} />
              {action.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
