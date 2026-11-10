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
import {
  canShowTip,
  countTipEvent,
  freshTips,
  loadTips,
  saveTips,
  tipStorageKey,
  TIP_DEFINITIONS,
  type TipId,
  type TipState,
} from './tipsState';
import './tips.css';

type Environment = { page: string; ready: boolean; resting: boolean; workoutCount: number };
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
  enable: (value: boolean) => void;
  library: () => void;
  browseHome: (id: TipId) => void;
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
  enable: noop,
  library: noop,
  browseHome: noop,
});
// eslint-disable-next-line react-refresh/only-export-components
export const useTips = () => useContext(TipsContext);

function quiet() {
  return (
    document.visibilityState !== 'hidden' &&
    !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]') &&
    !document.querySelector(
      'dialog[open], [role="dialog"], .pr-toast, .workout-completion-toast, .workout-share-prompt, .undo-toast, .weekly-sets-shelf, .body-check-in-toast, .workout-share-toast',
    )
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
  const [state, setState] = useState(() => (account ? loadTips(account) : freshTips()));
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
  const quietSince = useRef(0);
  const [api] = useState(() => {
    function write(next: TipState) {
      stateRef.current = next;
      setState(next);
      if (account) saveTips(account, next);
    }
    function close() {
      activeRef.current = null;
      setSlot(null);
      setActive(null);
    }
    return {
      configure(next: Environment) {
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
        const next = countTipEvent(stateRef.current, name);
        write(next);
        if (tip && next.counts[name] >= threshold && !next.seen[tip])
          pending.current.set(tip, { until: Date.now() + 120000, page: env.current.page });
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
      enable(enabled: boolean) {
        write({ ...stateRef.current, enabled });
        if (!enabled) close();
      },
      browseHome(id: TipId) {
        if (
          !stateRef.current.enabled ||
          !env.current.ready ||
          !quiet() ||
          TIP_DEFINITIONS[id].surface !== 'home'
        )
          return;
        const now = Date.now();
        write({
          ...stateRef.current,
          lastShown: now,
          seen: { ...stateRef.current.seen, [id]: 'seen' },
        });
        activeRef.current = id;
        activeSince.current = now;
        activePage.current = env.current.page;
        setActive(id);
      },
      library() {
        setLibraryOpen(true);
      },
      close,
    };
  });
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (!account || (event.key !== tipStorageKey(account) && event.key !== null)) return;
      const next = loadTips(account);
      stateRef.current = next;
      setState(next);
      api.close();
    };
    const tick = () => {
      const now = Date.now(),
        current = env.current;
      const available =
        !!account &&
        current.ready &&
        current.workoutCount > 0 &&
        stateRef.current.enabled &&
        quiet();
      if (!available) {
        quietSince.current = 0;
        if (activeRef.current) api.close();
        return;
      }
      if (!quietSince.current) quietSince.current = now;
      if (activeRef.current) {
        const id = activeRef.current;
        if (
          activePage.current !== current.page ||
          (TIP_DEFINITIONS[id].surface === 'nudge' &&
            (now - activeSince.current >= 12000 ||
              (current.page === 'log' &&
                !current.resting &&
                now - completedSetAt.current >= 20000)))
        )
          api.close();
        return;
      }
      if (now - quietSince.current < 1500) return;
      const nudge = [...pending.current].find(
        ([id, request]) =>
          request.until > now &&
          (id === 'back' || request.page === current.page) &&
          canShowTip(stateRef.current, id, now) &&
          (current.page !== 'log' || current.resting || now - completedSetAt.current < 20000),
      );
      const candidate = [...candidates.current.entries()].find(
        ([, { id, element }]) => canShowTip(stateRef.current, id, now) && visible(element),
      );
      const id = nudge?.[0] ?? candidate?.[1].id;
      if (!id) return;
      // Read again before claiming: another tab may have spent today's shared allowance.
      const stored = loadTips(account!);
      if (stored.lastShown > stateRef.current.lastShown) {
        stateRef.current = stored;
        setState(stored);
        return;
      }
      const next = {
        ...stateRef.current,
        lastShown: now,
        seen: { ...stateRef.current.seen, [id]: 'seen' as const },
      };
      stateRef.current = next;
      setState(next);
      saveTips(account!, next);
      setSlot(nudge ? null : (candidate?.[0] ?? null));
      activeRef.current = id;
      activeSince.current = now;
      activePage.current = current.page;
      setActive(id);
      pending.current.delete(id);
    };
    const timer = window.setInterval(tick, 500);
    window.addEventListener('storage', sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener('storage', sync);
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
  children,
  nextId,
}: {
  id: TipId;
  eligible: boolean;
  nextId?: TipId;
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
  const swipeStart = useRef<number | null>(null);
  const home = TIP_DEFINITIONS[id].surface === 'home';
  useEffect(() => {
    if (!eligible || !ref.current) return;
    return register(key, { id, element: ref.current, until: Infinity });
  }, [eligible, id, key, register]);
  const active = eligible && tips.active === id && tips.slot === key && tips.environment.ready;
  const tip = TIP_DEFINITIONS[id];
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
          <aside
            className="relay-tip-home"
            aria-label="Quick tip"
            onPointerDown={(event) => {
              swipeStart.current = event.clientX;
            }}
            onPointerUp={(event) => {
              if (
                nextId &&
                swipeStart.current !== null &&
                Math.abs(event.clientX - swipeStart.current) > 45
              )
                tips.browseHome(nextId);
              swipeStart.current = null;
            }}
            onPointerCancel={() => {
              swipeStart.current = null;
            }}
          >
            <Icon name="sparkle" />
            <div>
              <strong>{tip.title}</strong>
              <p>{tip.body}</p>
              <div className="relay-tip-actions">
                <button className="relay-tip-link" type="button" onClick={tips.library}>
                  All tips <Icon name="chevron-right" />
                </button>
                {nextId && (
                  <button
                    type="button"
                    className="relay-tip-close"
                    aria-label="Next tip"
                    onClick={() => tips.browseHome(nextId)}
                  >
                    <Icon name="chevron-right" />
                  </button>
                )}
              </div>
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
              onClick={() => setOpen(!open)}
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
                  <button type="button" className="relay-tip-link" onClick={tips.dismiss}>
                    Got it
                  </button>
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
        <strong>Show tips on this device</strong>
        <button
          type="button"
          className={tips.state.enabled ? 'is-on' : ''}
          role="switch"
          aria-checked={tips.state.enabled}
          aria-label="Show tips on this device"
          onClick={() => tips.enable(!tips.state.enabled)}
        >
          <span />
          {tips.state.enabled ? 'On' : 'Off'}
        </button>
      </div>
    </section>
  );
}
