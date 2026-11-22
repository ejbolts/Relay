import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Icon, type IconName } from './Icon';
import { RestTimeSelect } from './RestTimeSelect';
import { WorkoutHeaderMeta } from './WorkoutRestTimer';
import { useLiveWorkoutSheet } from './liveWorkoutSheetContext';
import { leavesMenu } from './menuDismiss';
import './liveWorkout.css';

export function LiveWorkoutHeader({
  name,
  dateLabel = null,
  durationLabel,
  loggedSets,
  paused,
  menuButtonRef,
  onMinimise,
  onRename,
  onAdjustTime,
  onAddNote,
  onTogglePause,
  onStartRest,
  restRunning = false,
  onDiscard,
  discardLabel = 'Discard workout',
  onFinish,
  saving = false,
}: {
  name: string;
  /** The workout's day when it is not today, such as a resumed session from last night. */
  dateLabel?: string | null;
  durationLabel: string;
  loggedSets: number;
  paused: boolean;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onMinimise: () => void;
  onRename: () => void;
  onAdjustTime?: () => void;
  onAddNote: () => void;
  onTogglePause: () => void;
  /** Starts a rest of the chosen length; left out when rest timers are turned off. */
  onStartRest?: (seconds: number) => void;
  restRunning?: boolean;
  /** Throwing the workout away sits last in the menu, away from the everyday actions. */
  onDiscard: () => void;
  discardLabel?: string;
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
      if (leavesMenu(root.current, event)) setOpen(false);
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
    { label: discardLabel, icon: 'trash', run: onDiscard, danger: true },
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
        <span className="sheet-grabber" aria-hidden="true" />
      </button>
      <div className="live-workout-toolbar">
        <div className="overlay-header-copy">
          <strong title={name}>{name}</strong>
          <div className="live-workout-meta">
            {dateLabel && (
              <>
                <span className="live-workout-date">{dateLabel}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <WorkoutHeaderMeta
              durationLabel={durationLabel}
              paused={paused}
              onEditTime={onAdjustTime}
            />
            <span aria-hidden="true">·</span>
            <span>
              {loggedSets} {loggedSets === 1 ? 'set' : 'sets'}
            </span>
          </div>
        </div>
        {onStartRest && (
          // The button is drawn under a transparent select, so a tap opens the same system menu of
          // rest times as the rest pill between sets.
          <label
            className={`live-workout-rest${restRunning ? ' is-running' : ''}`}
            title="Rest timer"
          >
            <Icon name="timer" />
            <RestTimeSelect
              seconds={null}
              label="Rest timer"
              placeholder="Rest"
              customStart={120}
              onChange={(seconds) => {
                if (seconds > 0) onStartRest(seconds);
              }}
            />
          </label>
        )}
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
          className="pulse-button small live-workout-finish"
          aria-label="Finish workout"
          title="Finish workout"
          disabled={saving}
          aria-busy={saving}
          onClick={onFinish}
        >
          Finish<span className="sr-only"> workout</span>
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
