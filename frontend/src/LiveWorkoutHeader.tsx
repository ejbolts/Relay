import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Icon, type IconName } from './Icon';
import { RestTimeSelect } from './RestTimeSelect';
import { WorkoutHeaderMeta } from './WorkoutRestTimer';
import { useLiveWorkoutSheet } from './liveWorkoutSheetContext';
import { leavesMenu } from './menuDismiss';
import './liveWorkout.css';

/** A workout type offered in the menu, with the colour its days are drawn in. */
export interface LiveWorkoutTypeOption {
  id: string;
  name: string;
  color: string;
}

type MenuView = 'actions' | 'types';

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
  workoutTypes = [],
  selectedTypeId = null,
  typesLoading = false,
  onChooseType,
  onTogglePause,
  onStartRest,
  restRunning = false,
  onDiscard,
  discardLabel = 'Discard workout',
  onFinish,
  saving = false,
  trainTogetherActive = false,
  onTrainTogether,
  onLeaveTrainTogether,
  deck,
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
  workoutTypes?: LiveWorkoutTypeOption[];
  selectedTypeId?: string | null;
  typesLoading?: boolean;
  /** Switches the workout to another type; left out to keep the type off the menu. */
  onChooseType?: (id: string) => void;
  onTogglePause: () => void;
  /** Starts a rest of the chosen length; left out when rest timers are turned off. */
  onStartRest?: (seconds: number) => void;
  restRunning?: boolean;
  /** Throwing the workout away sits last in the menu, away from the everyday actions. */
  onDiscard: () => void;
  discardLabel?: string;
  onFinish: () => void;
  saving?: boolean;
  /** Removes the bottom border while the Train together link hairline and Live Deck sit below. */
  trainTogetherActive?: boolean;
  /** Opens the Train together sheet from the options menu before a session starts. */
  onTrainTogether?: () => void;
  /** Leaves the active Train together session from the options menu, without confirmation. */
  onLeaveTrainTogether?: () => void;
  /** Linked-session strip anchored directly beneath the header toolbar. */
  deck?: ReactNode;
}) {
  // Closed, the everyday actions, or the workout types opened from them.
  const [view, setView] = useState<MenuView | null>(null);
  const open = view !== null;
  const backToTypeItem = useRef(false);
  const sheet = useLiveWorkoutSheet();
  const minimise = sheet?.minimise ?? onMinimise;
  const root = useRef<HTMLElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    const host =
      root.current?.closest<HTMLElement>('.live-workout-sheet') ?? root.current?.parentElement;
    const deckEl = deckRef.current;
    if (!host || !deckEl) {
      host?.style.removeProperty('--train-deck-height');
      return;
    }
    const update = () => {
      host.style.setProperty('--train-deck-height', `${deckEl.offsetHeight}px`);
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      return () => host.style.removeProperty('--train-deck-height');
    }
    const observer = new ResizeObserver(update);
    observer.observe(deckEl);
    return () => {
      observer.disconnect();
      host.style.removeProperty('--train-deck-height');
    };
  }, [deck]);

  useEffect(() => {
    if (!view) return;
    // The types open on the ticked one; coming back lands on the item that opened them.
    const items = menu.current;
    const target =
      view === 'types'
        ? items?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
        : backToTypeItem.current
          ? items?.querySelector<HTMLButtonElement>('.live-workout-menu-type')
          : null;
    backToTypeItem.current = false;
    (target ?? items?.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [view]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (leavesMenu(root.current, event)) setView(null);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open]);

  const selectedType = workoutTypes.find((type) => type.id === selectedTypeId);
  const actions: Array<{
    label: string;
    icon: IconName;
    run: () => void;
    danger?: boolean;
    /** The current value, shown at the end of an item that opens a list to change it. */
    value?: string;
    opensList?: boolean;
    disabled?: boolean;
  }> = [
    { label: 'Rename workout', icon: 'edit', run: onRename },
    ...(onAdjustTime
      ? [{ label: 'Adjust workout time', icon: 'timer' as const, run: onAdjustTime }]
      : []),
    ...(onChooseType
      ? [
          {
            label: 'Workout type',
            icon: 'tag' as const,
            run: () => setView('types'),
            value: selectedType?.name,
            opensList: true,
            disabled: typesLoading || workoutTypes.length === 0,
          },
        ]
      : []),
    { label: 'Add note', icon: 'comment', run: onAddNote },
    {
      label: paused ? 'Resume workout' : 'Pause workout',
      icon: paused ? 'play' : 'pause',
      run: onTogglePause,
    },
    ...(onLeaveTrainTogether
      ? [
          {
            label: 'Leave session',
            icon: 'people' as const,
            run: onLeaveTrainTogether,
            danger: true,
          },
        ]
      : onTrainTogether
        ? [{ label: 'Train together', icon: 'people' as const, run: onTrainTogether }]
        : []),
    { label: discardLabel, icon: 'trash', run: onDiscard, danger: true },
  ];

  return (
    <header
      ref={root}
      className={`overlay-screen-header live-workout-header${trainTogetherActive ? ' has-train-deck' : ''}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setView(null);
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
          onClick={() => setView((value) => (value ? null : 'actions'))}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setView((value) => value ?? 'actions');
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
      {deck && (
        <div ref={deckRef} className="tt-header-deck">
          {deck}
        </div>
      )}
      {open && (
        <div
          ref={menu}
          id={menuId}
          className="live-workout-menu"
          role="menu"
          aria-label={view === 'types' ? 'Workout type' : 'Workout options'}
          onKeyDown={(event) => {
            const buttons = Array.from(
              menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
            );
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
          {view === 'types' ? (
            <>
              <button
                type="button"
                role="menuitem"
                aria-label="Back from workout type"
                className="live-workout-menu-back"
                onClick={() => {
                  backToTypeItem.current = true;
                  setView('actions');
                }}
              >
                <Icon name="chevron-left" />
                Workout type
              </button>
              {workoutTypes.map((type) => {
                const selected = type.id === selectedTypeId;
                return (
                  <button
                    key={type.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    aria-label={type.name}
                    onClick={() => {
                      setView(null);
                      menuButtonRef.current?.focus();
                      if (!selected) onChooseType?.(type.id);
                    }}
                  >
                    <span
                      className="live-workout-menu-swatch"
                      style={{ backgroundColor: type.color }}
                      aria-hidden="true"
                    />
                    <span className="live-workout-menu-label">{type.name}</span>
                    {selected && <Icon name="check" />}
                  </button>
                );
              })}
            </>
          ) : (
            actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                aria-label={action.value ? `${action.label}: ${action.value}` : action.label}
                className={
                  action.danger ? 'danger' : action.opensList ? 'live-workout-menu-type' : undefined
                }
                disabled={action.disabled}
                onClick={() => {
                  if (!action.opensList) {
                    setView(null);
                    menuButtonRef.current?.focus();
                  }
                  action.run();
                }}
              >
                <Icon name={action.icon} />
                {action.label}
                {action.opensList && (
                  <span className="live-workout-menu-value">
                    {action.value && <span>{action.value}</span>}
                    <Icon name="chevron-right" />
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </header>
  );
}
