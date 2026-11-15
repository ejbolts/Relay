import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Icon, type IconName } from './Icon';
import { WorkoutHeaderMeta } from './WorkoutRestTimer';
import { useLiveWorkoutSheet } from './liveWorkoutSheetContext';
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
  onFinish,
  saving = false,
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
  onFinish: () => void;
  saving?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sheet = useLiveWorkoutSheet();
  const minimise = sheet?.minimise ?? onMinimise;
  const root = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDivElement>(null);
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
  ];

  return (
    <header
      ref={root}
      className="overlay-screen-header live-workout-header"
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
          minimise();
        }}
      >
        <span />
      </button>
      <div className="live-workout-toolbar">
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
        <button
          type="button"
          className="live-workout-finish"
          aria-label="Finish workout"
          title="Finish workout"
          disabled={saving}
          aria-busy={saving}
          onClick={onFinish}
        >
          <Icon name="check" />
          <span className="sr-only">Finish workout</span>
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
