import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { useToast } from './Toast';
import { openTipTarget } from './tipActions';
import {
  hintMayShow,
  interruptedNudge,
  priorityTipWaiting,
  shownTipEnds,
  tipEventRequest,
  TIP_QUIET_MS,
  waitingNudge,
  type ShownNudge,
  type TipEnvironment,
} from './tipScheduling';
import {
  freshTips,
  isPriorityTip,
  isQuietTip,
  tipAction,
  tipShown,
  tipStorageKey,
  TIP_DEFINITIONS,
  withTipReminders,
  withTipsEnabled,
  type TipId,
  type TipState,
} from './tipsState';
import {
  holdTipSync,
  loadSavedTips,
  loadTips,
  loadTipSyncHold,
  saveTips,
  sendTips,
} from './tipsStorage';
import { createTipSync, tipSyncHoldUntil, type TipSync } from './tipSync';
import './tips.css';

type Environment = TipEnvironment;
type Candidate = { id: TipId; element: HTMLElement; until: number };
const noop = () => {};
interface TipsApi {
  state: TipState;
  active: TipId | null;
  slot: string | null;
  environment: Environment;
  configure: (environment: Environment) => void;
  register: (key: string, candidate: Candidate) => () => void;
  event: (name: string, tip?: TipId, threshold?: number) => void;
  learn: (id: TipId) => void;
  dismiss: () => void;
  /** Retires one tip for good, whether or not it is the active one. */
  dismissTip: (id: TipId) => void;
  /** Records a Home tip as opened without spending contextual discovery. */
  readHome: (id: TipId) => void;
  /** Puts a Home tip away. It leaves the bulb, but can still appear where it applies. */
  doneHome: (id: TipId) => void;
  /** The tip was opened or acted on, so it has been seen and need not appear by itself again. */
  engage: (id: TipId) => void;
  /** Runs a tip's button: the tip is seen and the app opens the place it names. */
  act: (id: TipId, exerciseId?: string) => void;
  enable: (value: boolean) => void;
  library: () => void;
}
const TipsContext = createContext<TipsApi>({
  state: freshTips(),
  active: null as TipId | null,
  slot: null,
  environment: { page: '', ready: false, resting: false, workoutCount: 0 } as Environment,
  configure: noop,
  register: () => noop,
  event: noop,
  learn: noop,
  dismiss: noop,
  dismissTip: noop,
  readHome: noop,
  doneHome: noop,
  engage: noop,
  act: noop,
  enable: noop,
  library: noop,
});
// eslint-disable-next-line react-refresh/only-export-components
export const useTips = () => useContext(TipsContext);

function quiet(toastShowing: boolean) {
  return (
    !toastShowing &&
    document.visibilityState !== 'hidden' &&
    !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]') &&
    !document.querySelector('dialog[open], [role="dialog"], .setup-coach, .weekly-sets-shelf')
  );
}
function visible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return (
    !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
    rect.width > 0 &&
    rect.top >= 0 &&
    rect.bottom < window.innerHeight - 75
  );
}

export function TipsProvider({
  account,
  children,
}: {
  account: string | null;
  children: ReactNode;
}) {
  const [state, setState] = useState(() =>
    account ? withTipReminders(loadTips(account), Date.now()) : freshTips(),
  );
  const stateRef = useRef(state);
  const [active, setActive] = useState<TipId | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const activeRef = useRef<TipId | null>(null);
  const [environment, setEnvironment] = useState<Environment>({
    page: '',
    ready: false,
    resting: false,
    workoutCount: 0,
  });
  const env = useRef(environment);
  const candidates = useRef(new Map<string, Candidate>());
  const completedSetAt = useRef(0);
  const pending = useRef(new Map<TipId, { until: number; page: string }>());
  const [libraryOpen, setLibraryOpen] = useState(false);
  const activePage = useRef('');
  const activeSince = useRef(0);
  const activeNudge = useRef<ShownNudge | null>(null);
  const quietSince = useRef(0);
  const toastShowing = useRef(false);
  toastShowing.current = useToast().active;
  // Keeps this account's tips in step with its other devices and the app (tipSync).
  const syncRef = useRef<TipSync | null>(null);
  const [api] = useState(() => {
    function write(change: TipState) {
      // A guided tip put away before its feature is used is scheduled to come back.
      const next = withTipReminders(change, Date.now());
      stateRef.current = next;
      setState(next);
      if (account) saveTips(account, next);
      syncRef.current?.changed();
    }
    function close() {
      activeRef.current = null;
      activeNudge.current = null;
      setSlot(null);
      setActive(null);
    }
    return {
      configure(next: Environment) {
        if (env.current.page !== next.page) close();
        env.current = next;
        setEnvironment(next);
      },
      register(key: string, candidate: Candidate) {
        candidates.current.set(key, candidate);
        return () => {
          candidates.current.delete(key);
        };
      },
      event(name: string, tip?: TipId, threshold = 1) {
        if (name === 'set-completed') {
          completedSetAt.current = Date.now();
          return;
        }
        const { state: next, request } = tipEventRequest(
          stateRef.current,
          name,
          tip,
          threshold,
          env.current.page,
          Date.now(),
        );
        write(next);
        if (tip && request) pending.current.set(tip, request);
      },
      learn(id: TipId) {
        if (stateRef.current.seen[id] === 'learned') return;
        write({ ...stateRef.current, seen: { ...stateRef.current.seen, [id]: 'learned' } });
        pending.current.delete(id);
        if (activeRef.current === id) close();
      },
      dismiss() {
        const id = activeRef.current;
        if (id)
          write({ ...stateRef.current, seen: { ...stateRef.current.seen, [id]: 'dismissed' } });
        close();
      },
      dismissTip(id: TipId) {
        write({ ...stateRef.current, seen: { ...stateRef.current.seen, [id]: 'dismissed' } });
        pending.current.delete(id);
        if (activeRef.current === id) close();
      },
      readHome(id: TipId) {
        const read = stateRef.current.homeRead ?? [];
        if (!read.includes(id)) write({ ...stateRef.current, homeRead: [...read, id] });
      },
      doneHome(id: TipId) {
        const done = stateRef.current.homeDone ?? [];
        if (!done.includes(id)) write({ ...stateRef.current, homeDone: [...done, id] });
      },
      engage(id: TipId) {
        if (stateRef.current.seen[id]) return;
        write({ ...stateRef.current, seen: { ...stateRef.current.seen, [id]: 'seen' } });
        pending.current.delete(id);
      },
      act(id: TipId, exerciseId?: string) {
        const action = tipAction(id);
        if (!action) return;
        if (!stateRef.current.seen[id])
          write({ ...stateRef.current, seen: { ...stateRef.current.seen, [id]: 'seen' } });
        pending.current.delete(id);
        setLibraryOpen(false);
        if (activeRef.current === id) close();
        openTipTarget({ target: action.target, ...(exerciseId && { exerciseId }) });
      },
      enable(enabled: boolean) {
        write(withTipsEnabled(stateRef.current, enabled, Date.now()));
        if (!enabled) close();
      },
      library() {
        setLibraryOpen(true);
      },
      close,
    };
  });
  useEffect(() => {
    // Keep reminders that came back or were scheduled while loading.
    if (account && JSON.stringify(loadTips(account)) !== JSON.stringify(stateRef.current))
      saveTips(account, stateRef.current);
    const tipSync: TipSync | null = account
      ? createTipSync({
          // Another tab may have saved since this one last heard: replies merge into that.
          read: () => loadSavedTips(account) ?? stateRef.current,
          write: (next) => {
            const previous = stateRef.current;
            stateRef.current = next;
            setState(next);
            saveTips(account, next);
            // A reply (such as an adopted restore that dismisses the showing tip) is reconciled
            // with the showing tip like another tab's change.
            reconcileActive(previous, next);
          },
          // The server refuses the tips if this browser is now signed in to another account.
          send: (tips, generation) => sendTips(account, tips, generation),
          current: () => syncRef.current === tipSync,
          sharedHold: () => loadTipSyncHold(account),
        })
      : null;
    syncRef.current = tipSync;
    tipSync?.syncNow();
    const sync = (event: StorageEvent) => {
      if (!account || (event.key !== tipStorageKey(account) && event.key !== null)) return;
      const previous = stateRef.current;
      const next = withTipReminders(loadTips(account), Date.now());
      stateRef.current = next;
      setState(next);
      reconcileActive(previous, next);
    };
    /**
     * Another tab or a sync reply changed the tips while one shows. It stays up when the change
     * leaves it as it is: a nudge whose showing is still ours (keeping its rollback), or another
     * tip whose status is unchanged while tips stay on. Otherwise a nudge goes through the guarded
     * rollback, which leaves newer state alone, and any other tip closes.
     */
    const reconcileActive = (previous: TipState, next: TipState) => {
      const id = activeRef.current;
      if (!id) return;
      const currentNudge = activeNudge.current;
      const unaffected = currentNudge
        ? showingStillOurs(next, currentNudge)
        : next.enabled && next.seen[id] === previous.seen[id];
      if (unaffected) return;
      if (currentNudge) interrupt(Date.now());
      else api.close();
    };
    /** The stored tips still hold this nudge's showing and nothing newer has replaced it. */
    const showingStillOurs = (stored: TipState, currentNudge: ShownNudge) =>
      stored.enabled &&
      stored.lastShown === currentNudge.at &&
      (stored.shows?.[currentNudge.id] ?? 0) === currentNudge.shownCount &&
      stored.seen[currentNudge.id] === currentNudge.seenAfter;
    const interrupt = (now: number) => {
      const currentNudge = activeNudge.current;
      if (currentNudge && account) {
        // Read the latest stored state before rolling back: another tab may have saved a newer
        // showing or change before its storage event arrived. Leave newer stored state untouched.
        const stored = loadTips(account);
        if (showingStillOurs(stored, currentNudge)) {
          const reverted = interruptedNudge(stored, currentNudge, now);
          if (reverted) {
            const next = withTipReminders(reverted.state, now);
            stateRef.current = next;
            setState(next);
            saveTips(account, next);
            tipSync?.changed();
            pending.current.set(currentNudge.id, reverted.request);
          }
        }
      }
      api.close();
    };
    const tick = () => {
      const now = Date.now(),
        current = env.current;
      if (!account || !stateRef.current.enabled) {
        quietSince.current = 0;
        if (activeRef.current) api.close();
        return;
      }
      if (!current.ready || !quiet(toastShowing.current)) {
        quietSince.current = 0;
        if (activeRef.current) interrupt(now);
        return;
      }
      if (!quietSince.current) quietSince.current = now;
      if (activeRef.current) {
        const id = activeRef.current;
        if (
          shownTipEnds(
            id,
            { page: activePage.current, at: activeSince.current },
            current,
            completedSetAt.current,
            now,
          )
        ) {
          api.close();
          return;
        }
        // A waiting priority nudge replaces an ordinary tip that is already showing.
        if (
          isPriorityTip(id) ||
          !priorityTipWaiting(pending.current, stateRef.current, current.page, now)
        )
          return;
        api.close();
      }
      if (now - quietSince.current < TIP_QUIET_MS) return;
      const nudge = waitingNudge(
        pending.current,
        stateRef.current,
        current,
        completedSetAt.current,
        now,
      );
      const candidate = [...candidates.current.entries()].find(
        ([, { id, element }]) =>
          hintMayShow(stateRef.current, id, current, now) && visible(element),
      );
      const id = nudge ?? candidate?.[1].id;
      if (!id) return;
      // Read again before claiming: another tab may have spent today's shared allowance.
      const stored = loadTips(account!);
      if (!isQuietTip(id) && stored.lastShown > stateRef.current.lastShown) {
        stateRef.current = stored;
        setState(stored);
        return;
      }
      const previousLastShown = stateRef.current.lastShown;
      const request = nudge ? pending.current.get(nudge) : undefined;
      const next = withTipReminders(tipShown(stateRef.current, id, now), now);
      // An interrupted nudge may be put back, so its showing waits before reaching the server,
      // from this tab or any other: the hold is saved before the showing.
      if (nudge) {
        holdTipSync(account!, tipSyncHoldUntil(now));
        tipSync?.hold(tipSyncHoldUntil(now));
      }
      stateRef.current = next;
      setState(next);
      saveTips(account!, next);
      tipSync?.changed();
      setSlot(nudge ? null : (candidate?.[0] ?? null));
      activeRef.current = id;
      activeSince.current = now;
      activePage.current = current.page;
      activeNudge.current =
        nudge && request
          ? {
              id: nudge,
              at: now,
              previousLastShown,
              request,
              shownCount: next.shows?.[nudge] ?? 0,
              seenAfter: next.seen[nudge],
            }
          : null;
      setActive(id);
      pending.current.delete(id);
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        quietSince.current = 0;
        if (activeRef.current) interrupt(Date.now());
        return;
      }
      // An app left open for days still brings reminders back when it is next looked at.
      const reminded = withTipReminders(stateRef.current, Date.now());
      if (reminded !== stateRef.current) {
        stateRef.current = reminded;
        setState(reminded);
        if (account) saveTips(account, reminded);
        tipSync?.changed();
      }
      tipSync?.refresh();
    };
    const focus = () => tipSync?.refresh();
    const timer = window.setInterval(tick, 500);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('storage', sync);
    window.addEventListener('focus', focus);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', focus);
      tipSync?.stop();
      if (syncRef.current === tipSync) syncRef.current = null;
    };
  }, [account, api]);
  useEffect(() => {
    if (!active) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') api.dismiss();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [active, api]);
  const nudge =
    active && TIP_DEFINITIONS[active].surface === 'nudge' ? TIP_DEFINITIONS[active] : null;
  return (
    <TipsContext.Provider value={{ state, active, slot, environment, ...api }}>
      {children}
      {nudge &&
        createPortal(
          <aside className="relay-tip-nudge" aria-label="Quick tip">
            <Icon name="sparkle" />
            <div role="status">
              <strong>{nudge.title}</strong>
              <p>{nudge.body}</p>
              {active && tipAction(active) && (
                <button type="button" className="relay-tip-link" onClick={() => api.act(active)}>
                  {tipAction(active)!.label} <Icon name="chevron-right" />
                </button>
              )}
            </div>
            <button
              type="button"
              className="relay-tip-close"
              aria-label="Dismiss tip"
              onClick={api.dismiss}
            >
              <Icon name="close" />
            </button>
          </aside>,
          document.body,
        )}
      {libraryOpen && (
        <PopupDialog title="Tips" onClose={() => setLibraryOpen(false)}>
          <div className="relay-tip-library">
            {Object.entries(TIP_DEFINITIONS).map(([id, tip]) => (
              <article key={id}>
                <h3>
                  {tip.title}
                  {state.seen[id as TipId] === 'learned' && <Icon name="check" />}
                </h3>
                <p>{tip.body}</p>
                {tipAction(id as TipId) && (
                  <button
                    type="button"
                    className="relay-tip-link"
                    onClick={() => api.act(id as TipId)}
                  >
                    {tipAction(id as TipId)!.label} <Icon name="chevron-right" />
                  </button>
                )}
              </article>
            ))}
          </div>
        </PopupDialog>
      )}
    </TipsContext.Provider>
  );
}

export function TipSlot({
  id,
  eligible,
  onAction,
  children,
}: {
  id: TipId;
  eligible: boolean;
  /**
   * Runs the tip's button right here, for a tip anchored to the control it describes. Without
   * it the button asks the app to open the tip's target.
   */
  onAction?: () => void;
  children?: ReactNode;
}) {
  const tips = useTips();
  const { register } = tips;
  const ref = useRef<HTMLSpanElement>(null);
  const key = useId();
  const popId = useId();
  const [open, setOpen] = useState(false);
  const popover = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 0 });
  const home = TIP_DEFINITIONS[id].surface === 'home';
  useEffect(() => {
    if (!eligible || !ref.current) return;
    return register(key, { id, element: ref.current, until: Infinity });
  }, [eligible, id, key, register]);
  const active = eligible && tips.active === id && tips.slot === key && tips.environment.ready;
  const tip = TIP_DEFINITIONS[id];
  const action = tipAction(id);
  const runAction = () => {
    setOpen(false);
    if (onAction) {
      tips.dismissTip(id);
      onAction();
    } else tips.act(id);
  };
  useLayoutEffect(() => {
    if (!open || !active) return;
    const measure = () => {
      const target = ref.current?.getBoundingClientRect();
      const box = popover.current?.getBoundingClientRect();
      if (!target || !box) return;
      setPosition({
        left: Math.max(12, Math.min(window.innerWidth - box.width - 12, target.right - box.width)),
        top: Math.max(
          12,
          target.bottom + box.height > window.innerHeight - 75
            ? target.top - box.height - 6
            : target.bottom + 6,
        ),
      });
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !ref.current?.contains(event.target) &&
        !popover.current?.contains(event.target)
      )
        setOpen(false);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    document.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open, active]);
  return (
    <span ref={ref} className={home ? 'relay-tip-home-slot' : 'relay-tip-anchor'}>
      {children}
      {active &&
        (home ? (
          <aside className="relay-tip-home" aria-label="Quick tip">
            <Icon name="sparkle" />
            <div>
              <strong>{tip.title}</strong>
              <p>{tip.body}</p>
              {action && (
                <button className="relay-tip-link" type="button" onClick={runAction}>
                  {action.label} <Icon name="chevron-right" />
                </button>
              )}
            </div>
            <button
              type="button"
              className="relay-tip-close"
              aria-label="Dismiss tip"
              onClick={tips.dismiss}
            >
              <Icon name="close" />
            </button>
          </aside>
        ) : (
          <>
            <button
              type="button"
              className="relay-tip-dot"
              aria-label={`Tip: ${tip.title}`}
              aria-expanded={open}
              aria-controls={popId}
              onClick={() => {
                if (!open) tips.engage(id);
                setOpen(!open);
              }}
            >
              <span />
            </button>
            {open &&
              createPortal(
                <aside
                  ref={popover}
                  id={popId}
                  className="relay-tip-popover"
                  aria-label={tip.title}
                  style={position}
                >
                  <strong>{tip.title}</strong>
                  <p>{tip.body}</p>
                  <span className="relay-tip-popover-actions">
                    {action && (
                      <button type="button" className="relay-tip-action" onClick={runAction}>
                        {action.label}
                      </button>
                    )}
                    <button type="button" className="relay-tip-link" onClick={tips.dismiss}>
                      Got it
                    </button>
                  </span>
                </aside>,
                document.body,
              )}
          </>
        ))}
    </span>
  );
}

export function TipsSettings() {
  const tips = useTips();
  return (
    <section className="settings-panel panel" aria-labelledby="tips-settings-title">
      <header>
        <h2 id="tips-settings-title">Tips</h2>
        <button
          type="button"
          className="profile-secondary release-settings-action"
          onClick={tips.library}
        >
          Browse tips
        </button>
      </header>
      <div className="notification-setting-row">
        <strong>Show tips</strong>
        <button
          type="button"
          className={tips.state.enabled ? 'is-on' : ''}
          role="switch"
          aria-checked={tips.state.enabled}
          aria-label="Show tips"
          onClick={() => tips.enable(!tips.state.enabled)}
        >
          <span />
          {tips.state.enabled ? 'On' : 'Off'}
        </button>
      </div>
    </section>
  );
}
