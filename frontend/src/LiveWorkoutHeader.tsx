import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Icon, type IconName } from './Icon';
import { WorkoutHeaderMeta } from './WorkoutRestTimer';
import { useLiveWorkoutSheet } from './liveWorkoutSheetContext';
import { leavesMenu } from './menuDismiss';
import { formatSeconds } from './utils';
import './liveWorkout.css';

/** The rests the header's timer button offers. */
const HEADER_REST_OPTIONS = [30, 60, 90, 120, 180, 300];

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
  onEndRest,
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
  onEndRest?: () => void;
  /** Throwing the workout away sits last in the menu, away from the everyday actions. */
  onDiscard: () => void;
  discardLabel?: string;
  onFinish: () => void;
  saving?: boolean;
}) {
  // One header menu at a time: the workout options or the rest timer.
  const [openMenu, setOpenMenu] = useState<'options' | 'rest' | null>(null);
  const open = openMenu === 'options';
  const restOpen = openMenu === 'rest';
  const sheet = useLiveWorkoutSheet();
  const minimise = sheet?.minimise ?? onMinimise;
  const root = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const restButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const restMenuId = useId();
  const closeMenu = () => {
    const opener = openMenu === 'rest' ? restButtonRef : menuButtonRef;
    setOpenMenu(null);
    opener.current?.focus();
  };

  useEffect(() => {
    if (!openMenu) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: Event) => {
      if (leavesMenu(root.current, event)) setOpenMenu(null);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [openMenu]);

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

  function moveMenuFocus(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(menu.current?.querySelectorAll('button') ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
      next = (index + 1) % buttons.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
      next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[next]?.focus();
  }

  return (
    <header
      ref={root}
      className="overlay-screen-header live-workout-header"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && openMenu) {
          event.preventDefault();
          event.stopPropagation();
          closeMenu();
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
          <button
            ref={restButtonRef}
            type="button"
            className={`live-workout-rest${restRunning ? ' is-running' : ''}`}
            aria-label="Rest timer"
            title="Rest timer"
            aria-haspopup="menu"
            aria-expanded={restOpen}
            aria-controls={restOpen ? restMenuId : undefined}
            onClick={() => setOpenMenu((value) => (value === 'rest' ? null : 'rest'))}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setOpenMenu('rest');
              }
            }}
          >
            <Icon name="timer" />
          </button>
        )}
        <button
          ref={menuButtonRef}
          type="button"
          className="live-workout-options"
          aria-label="Workout options"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpenMenu((value) => (value === 'options' ? null : 'options'))}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpenMenu('options');
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
          onKeyDown={moveMenuFocus}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              aria-label={action.label}
              className={action.danger ? 'danger' : undefined}
              onClick={() => {
                closeMenu();
                action.run();
              }}
            >
              <Icon name={action.icon} />
              {action.label}
            </button>
          ))}
        </div>
      )}
      {restOpen && onStartRest && (
        <div
          ref={menu}
          id={restMenuId}
          className="live-workout-menu live-workout-rest-menu"
          role="menu"
          aria-label="Rest timer"
          onKeyDown={moveMenuFocus}
        >
          <strong className="live-workout-menu-title" aria-hidden="true">
            Start rest
          </strong>
          <div className="live-workout-rest-options">
            {HEADER_REST_OPTIONS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                role="menuitem"
                aria-label={`Start a ${formatSeconds(seconds)} rest`}
                onClick={() => {
                  closeMenu();
                  onStartRest(seconds);
                }}
              >
                {formatSeconds(seconds)}
              </button>
            ))}
          </div>
          {restRunning && onEndRest && (
            <button
              type="button"
              role="menuitem"
              aria-label="End rest"
              className="danger"
              onClick={() => {
                closeMenu();
                onEndRest();
              }}
            >
              <Icon name="close" />
              End rest
            </button>
          )}
        </div>
      )}
    </header>
  );
}
