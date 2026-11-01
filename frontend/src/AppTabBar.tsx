import { useEffect, useRef, useState } from 'react';
import type { MainTab } from './appNavigation';
import { Icon, type IconName } from './Icon';
import { formatElapsed, useElapsedSeconds, useLiveWorkoutClock } from './elapsed';
import { useRestCountdown } from './restTimer';
import { formatSeconds } from './utils';
import type { useHomeLayout } from './useHomeLayout';

const TABS: Array<{ tab: MainTab; label: string; icon: IconName }> = [
  { tab: 'dashboard', label: 'Home', icon: 'home' },
  { tab: 'training', label: 'Training', icon: 'calendar' },
  { tab: 'social', label: 'Social', icon: 'people' },
  { tab: 'body', label: 'Body', icon: 'body' },
];

export interface StartMenuActions {
  /** The recommended session's name, such as "Pull day", shown under Up next. */
  upNextLabel: string | null;
  onCardio: () => void;
  onUpNext: () => void;
  onEmpty: () => void;
}

export function AppTabBar({
  active,
  workoutStartedAt,
  restEndsAt = null,
  workoutSaving = false,
  onSelect,
  onStart,
  startMenu,
  homeLayout,
}: {
  active: MainTab | null;
  workoutStartedAt: number | null;
  /** While the live workout's rest runs, the button shows a timer counting it down. */
  restEndsAt?: number | null;
  workoutSaving?: boolean;
  onSelect: (tab: MainTab) => void;
  /** Resumes the live workout, or starts one when there is no Start menu. */
  onStart: () => void;
  /** Without a live workout, Start opens these choices instead of starting straight away. */
  startMenu?: StartMenuActions;
  homeLayout?: ReturnType<typeof useHomeLayout>;
}) {
  const live = workoutStartedAt !== null && !workoutSaving;
  const restLeft = useRestCountdown(live ? restEndsAt : null);
  const resting = restLeft > 0;
  const editing = Boolean(homeLayout?.editing);
  const busy = Boolean(homeLayout?.saving || homeLayout?.dragging);
  const menuAvailable = Boolean(startMenu) && workoutStartedAt === null && !workoutSaving;
  const [menuOpen, setMenuOpen] = useState(false);
  const open = menuOpen && menuAvailable && !editing;
  const startButton = useRef<HTMLButtonElement>(null);

  // A workout starting elsewhere, or Home's layout editor opening, dismisses the menu for good.
  useEffect(() => {
    if (!menuAvailable || editing) setMenuOpen(false);
  }, [editing, menuAvailable]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      startButton.current?.focus();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  function choose(action: () => void) {
    setMenuOpen(false);
    action();
  }

  const renderTab = ({ tab, label, icon }: (typeof TABS)[number]) => (
    <button
      key={tab}
      data-guide-target={tab === 'dashboard' ? 'today' : tab}
      type="button"
      className={`app-tab ${active === tab ? 'active' : ''}`}
      aria-current={active === tab ? 'page' : undefined}
      onClick={() => {
        setMenuOpen(false);
        onSelect(tab);
      }}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );

  return (
    <>
      {startMenu && (
        <>
          <div
            className={`start-menu-scrim${open ? ' open' : ''}`}
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
          />
          <div
            id="start-menu"
            className={`start-menu${open ? ' open' : ''}`}
            role="group"
            aria-label="Start a workout"
            aria-hidden={!open}
            inert={!open}
          >
            <button
              type="button"
              className="start-menu-option"
              onClick={() => choose(startMenu.onCardio)}
            >
              <span className="start-menu-icon">
                <Icon name="pulse" />
              </span>
              <span className="start-menu-label">Cardio</span>
            </button>
            <button
              type="button"
              className="start-menu-option"
              aria-label={startMenu.upNextLabel ? `Up next: ${startMenu.upNextLabel}` : 'Up next'}
              onClick={() => choose(startMenu.onUpNext)}
            >
              <span className="start-menu-icon">
                <Icon name="next" />
              </span>
              <span className="start-menu-label">Up next</span>
              {startMenu.upNextLabel && (
                <small className="start-menu-detail">{startMenu.upNextLabel}</small>
              )}
            </button>
            <button
              type="button"
              className="start-menu-option"
              aria-label="Empty workout"
              onClick={() => choose(startMenu.onEmpty)}
            >
              <span className="start-menu-icon">
                <Icon name="blank" />
              </span>
              <span className="start-menu-label">Empty</span>
            </button>
          </div>
        </>
      )}
      <nav
        className={`app-tab-bar${editing ? ' is-editing-home' : ''}`}
        aria-label={editing ? 'Home layout controls' : 'Main navigation'}
      >
        <div className="app-tab-items app-tab-navigation" inert={editing} aria-hidden={editing}>
          {TABS.slice(0, 2).map(renderTab)}
          <button
            type="button"
            ref={startButton}
            className={`app-tab app-tab-start ${live ? 'live' : ''}${resting ? ' resting' : ''}${open ? ' menu-open' : ''}`}
            data-guide-target="start"
            aria-expanded={menuAvailable ? open : undefined}
            aria-controls={menuAvailable ? 'start-menu' : undefined}
            aria-label={
              workoutSaving
                ? 'Saving workout'
                : resting
                  ? `Resume active workout, rest ${formatSeconds(restLeft)} left`
                  : live
                    ? 'Resume active workout'
                    : 'Start workout'
            }
            disabled={workoutSaving}
            onClick={() => (menuAvailable ? setMenuOpen(!open) : onStart())}
          >
            <span className="app-tab-start-bubble">
              {resting ? (
                <Icon name="timer" />
              ) : live ? (
                <LiveDot startedAt={workoutStartedAt} />
              ) : (
                <Icon name={workoutSaving ? 'check' : 'plus'} />
              )}
            </span>
            <span>
              {workoutSaving ? (
                'Saving'
              ) : resting ? (
                <span className="num">{formatSeconds(restLeft)}</span>
              ) : live ? (
                <LiveElapsed startedAt={workoutStartedAt} />
              ) : (
                'Start'
              )}
            </span>
          </button>
          {TABS.slice(2).map(renderTab)}
        </div>
        {homeLayout && (
          <div className="app-tab-items app-tab-layout" inert={!editing} aria-hidden={!editing}>
            <button
              type="button"
              className="app-tab"
              disabled={busy}
              aria-label="Cancel layout changes"
              onClick={homeLayout.cancel}
            >
              <Icon name="close" />
              <span>Cancel</span>
            </button>
            <button
              type="button"
              className="app-tab app-tab-start app-tab-save"
              disabled={busy}
              aria-label={homeLayout.saving ? 'Saving layout' : 'Save layout'}
              aria-busy={homeLayout.saving}
              onClick={() => void homeLayout.save()}
            >
              <span className="app-tab-start-bubble">
                <Icon name="check" />
              </span>
              <span>{homeLayout.saving ? 'Saving…' : 'Save'}</span>
            </button>
            <button
              type="button"
              className="app-tab"
              disabled={busy}
              aria-label="Reset layout"
              onClick={homeLayout.reset}
            >
              <Icon name="reset" />
              <span>Reset layout</span>
            </button>
          </div>
        )}
        {editing && homeLayout?.error && (
          <p className="app-tab-layout-error" role="alert">
            {homeLayout.error}
          </p>
        )}
      </nav>
    </>
  );
}

/** The live workout's dot stops pulsing and turns gold while the workout is paused. */
function LiveDot({ startedAt }: { startedAt: number }) {
  const { paused } = useLiveWorkoutClock(startedAt);
  return <i className={`live-dot${paused ? ' paused' : ''}`} aria-hidden="true" />;
}

function LiveElapsed({ startedAt }: { startedAt: number }) {
  const elapsed = useElapsedSeconds(startedAt);
  return <span className="num">{formatElapsed(elapsed)}</span>;
}
