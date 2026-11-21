import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import './toast.css';

export type ToastVariant = 'status' | 'action' | 'warning' | 'error' | 'celebrate';

/** The only toast durations in the app. Undo hooks use `TOAST_MS.action` for their commit delay. */
// eslint-disable-next-line react-refresh/only-export-components
export const TOAST_MS = {
  status: 4000,
  action: 6000,
  warning: 6000,
  celebrate: 6000,
  error: 8000,
  /** For an owner that passes `durationMs`: the Undo after deleting a workout set. */
  quickAction: 2500,
} as const;

/** A message longer than this gets the error tier's time, so there is time to read it. */
const LONG_MESSAGE_LENGTH = 90;
const MAX_LINES = 3;

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface ToastProps {
  /** Changing it restarts the countdown and the bar. */
  id?: string | number;
  message: string;
  /** A celebrate toast shows these instead of the message: up to three, then "+N more". */
  lines?: { title: string; detail?: string }[];
  /** Defaults to 'action' when there is an action, otherwise 'status'. */
  variant?: ToastVariant;
  /** Replaces the variant's time on screen. Use a `TOAST_MS` value. */
  durationMs?: number;
  action?: ToastAction;
  /** A second action before the main one. Only the finished-workout toast needs it. */
  secondaryAction?: ToastAction;
  /** Pauses the countdown and disables the buttons, for example while Undo is saving. */
  busy?: boolean;
  dismissLabel?: string;
  /**
   * The countdown ended, a newer toast replaced this one, or the app was hidden while an action
   * was on offer. Defaults to `onDismiss`.
   */
  onTimeout?: () => void;
  /** The close button. For an Undo toast this settles at once (commits), as before. */
  onDismiss: () => void;
}

export interface ToastOptions extends Omit<ToastProps, 'onDismiss'> {
  onDismiss?: () => void;
}

export interface ToastApi {
  /** Shows a toast in the shared slot, replacing (and settling) the one on screen. */
  show: (toast: string | ToastOptions) => void;
  /** Closes the toast on screen, as its close button does. */
  dismiss: () => void;
  /** True while a toast is on screen, from the render in which `show` is called. */
  active: boolean;
}

type ToastEdge = 'top' | 'bottom';

function toastVariant({ variant, action }: Pick<ToastProps, 'variant' | 'action'>): ToastVariant {
  return variant ?? (action ? 'action' : 'status');
}

function toastDuration(variant: ToastVariant, message: string): number {
  return message.length > LONG_MESSAGE_LENGTH
    ? Math.max(TOAST_MS[variant], TOAST_MS.error)
    : TOAST_MS[variant];
}

/** What ends a toast without the close button: the owner's timeout, or dismissal by default. */
function settle({ onTimeout, onDismiss }: Pick<ToastProps, 'onTimeout' | 'onDismiss'>) {
  (onTimeout ?? onDismiss)();
}

// ───────── The top-most open modal dialog ─────────
// A modal dialog makes everything outside it inert and draws above the rest of the page, so the
// toast viewport moves inside the newest one. Dialogs are tracked in the order they open.

const supportsPopover =
  typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

const dialogStore = {
  open: [] as HTMLDialogElement[],
  top: null as HTMLDialogElement | null,
  listeners: new Set<() => void>(),
  observer: null as MutationObserver | null,
};

function isModalDialog(dialog: HTMLDialogElement) {
  if (!dialog.open) return false;
  try {
    if (dialog.matches(':modal')) return true;
  } catch {
    // Engines without :modal fall back to the attribute every app dialog sets.
  }
  return dialog.getAttribute('aria-modal') === 'true';
}

function refreshDialogs(notify: boolean) {
  const open = Array.from(document.querySelectorAll('dialog[open]'), (node) => node).filter(
    (node): node is HTMLDialogElement => node instanceof HTMLDialogElement && isModalDialog(node),
  );
  const kept = dialogStore.open.filter((dialog) => open.includes(dialog));
  dialogStore.open = [...kept, ...open.filter((dialog) => !kept.includes(dialog))];
  const top = dialogStore.open.at(-1) ?? null;
  if (top === dialogStore.top) return;
  dialogStore.top = top;
  if (notify) dialogStore.listeners.forEach((listener) => listener());
}

function subscribeToDialogs(listener: () => void) {
  dialogStore.listeners.add(listener);
  if (!dialogStore.observer && typeof MutationObserver !== 'undefined') {
    dialogStore.observer = new MutationObserver(() => refreshDialogs(true));
    dialogStore.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    refreshDialogs(false);
  }
  return () => {
    dialogStore.listeners.delete(listener);
    if (dialogStore.listeners.size > 0) return;
    dialogStore.observer?.disconnect();
    dialogStore.observer = null;
    dialogStore.open = [];
    dialogStore.top = null;
  };
}

function useTopModalDialog() {
  return useSyncExternalStore(
    subscribeToDialogs,
    () => dialogStore.top,
    () => null,
  );
}

// ───────── Viewport: one lane at the top (or bottom), above every sheet and dialog ─────────

function ToastViewport({
  edge,
  bottomOffset,
  onElement,
  children,
}: {
  edge: ToastEdge;
  bottomOffset?: string;
  onElement?: (element: HTMLElement | null) => void;
  children?: ReactNode;
}) {
  const dialog = useTopModalDialog();
  // Inside a dialog the toast always sits at the top, clear of the dialog's actions.
  const lane = dialog ? 'top' : edge;
  const attach = useCallback(
    (element: HTMLElement | null) => {
      onElement?.(element);
      // The top layer puts the toast above sheets, dialogs and fixed pop-ups, and keeps it
      // pressable while a modal dialog makes the rest of the page inert.
      if (!element || !supportsPopover || !element.isConnected) return;
      try {
        if (!element.matches(':popover-open')) element.showPopover();
      } catch {
        // Not shown as a popover: the fixed position and z-index still keep it on top.
      }
    },
    [onElement],
  );
  return createPortal(
    <section
      ref={attach}
      className={`toast-viewport is-${lane}`}
      aria-label="Notifications"
      aria-live="polite"
      popover={supportsPopover ? 'manual' : undefined}
      style={
        lane === 'bottom' && bottomOffset
          ? ({ '--toast-bottom': bottomOffset } as CSSProperties)
          : undefined
      }
    >
      {children}
    </section>,
    dialog ?? document.body,
  );
}

// ───────── The toast card, its countdown and its pause ─────────

function ToastCard({
  variant,
  durationMs,
  message,
  lines,
  action,
  secondaryAction,
  busy,
  dismissLabel,
  paused,
  startOffset,
  onHeld,
  onDismiss,
}: {
  variant: ToastVariant;
  durationMs: number;
  message: string;
  lines?: ToastProps['lines'];
  action?: ToastAction;
  secondaryAction?: ToastAction;
  busy: boolean;
  dismissLabel: string;
  paused: boolean;
  startOffset: number;
  onHeld: (held: boolean) => void;
  onDismiss: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  // A card that remounts part-way through (its dialog opened or closed) carries on from there.
  const [offset] = useState(startOffset);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const held = hovered || pressed || focused;

  useEffect(() => onHeld(held), [held, onHeld]);
  useEffect(() => () => onHeld(false), [onHeld]);
  useEffect(() => {
    if (!pressed) return;
    const release = () => setPressed(false);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [pressed]);

  const alert = variant === 'warning' || variant === 'error';
  const shown = lines?.slice(0, MAX_LINES) ?? [];
  const more = (lines?.length ?? 0) - shown.length;
  return (
    <div
      ref={cardRef}
      className="toast"
      data-variant={variant}
      data-paused={paused ? '' : undefined}
      data-resumed={offset > 0 ? '' : undefined}
      role={alert ? 'alert' : 'status'}
      aria-live={alert ? 'assertive' : 'polite'}
      aria-atomic="true"
      style={
        {
          '--toast-ms': `${durationMs}ms`,
          '--toast-offset': `${-Math.min(offset, durationMs)}ms`,
        } as CSSProperties
      }
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={(event) => {
        if (event.pointerType !== 'mouse') setPressed(true);
      }}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!cardRef.current?.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {variant === 'celebrate' && (
        <span className="toast-icon" aria-hidden="true">
          <Icon name="trophy" />
        </span>
      )}
      <div className="toast-text">
        {shown.length > 0 ? (
          <>
            {shown.map((line, index) => (
              <p key={index} className="toast-line">
                <strong>{line.title}</strong>
                {line.detail && <small>{line.detail}</small>}
              </p>
            ))}
            {more > 0 && <p className="toast-more">+{more} more</p>}
          </>
        ) : (
          <p>{message}</p>
        )}
      </div>
      {secondaryAction && (
        <button
          type="button"
          className="toast-action"
          disabled={busy}
          onClick={() => void secondaryAction.run()}
        >
          {secondaryAction.label}
        </button>
      )}
      {action && (
        <button
          type="button"
          className="toast-action"
          disabled={busy}
          onClick={() => void action.run()}
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        className="toast-close"
        aria-label={dismissLabel}
        disabled={busy}
        onClick={onDismiss}
      >
        <Icon name="close" />
      </button>
      <span className="toast-timer" aria-hidden="true" />
    </div>
  );
}

/**
 * The countdown, pause and page-hide rules shared by every toast, returning its card. `current`
 * is false while another toast holds the slot; the card is then not shown and its timer stops.
 */
function useToastCard(props: ToastProps, current: boolean): ReactElement {
  const { id, message, action, busy = false } = props;
  const variant = toastVariant(props);
  const durationMs = props.durationMs ?? toastDuration(variant, message);
  const latest = useRef(props);
  latest.current = props;
  const [held, setHeld] = useState(false);
  const running = current && !held && !busy;
  // The countdown and leaving the app can both end a toast; it settles once per id.
  const settledId = useRef<{ id: ToastProps['id'] } | null>(null);
  const settleOnce = useCallback(() => {
    const { id: currentId } = latest.current;
    if (settledId.current && Object.is(settledId.current.id, currentId)) return;
    settledId.current = { id: currentId };
    settle(latest.current);
  }, []);

  const clock = useRef({ id, used: 0, since: null as number | null });
  useEffect(() => {
    if (!running) return;
    const state = clock.current;
    if (!Object.is(state.id, id)) Object.assign(state, { id, used: 0 });
    const since = Date.now();
    state.since = since;
    const timer = window.setTimeout(settleOnce, Math.max(0, durationMs - state.used));
    return () => {
      window.clearTimeout(timer);
      state.used += Date.now() - since;
      state.since = null;
    };
  }, [running, durationMs, id, settleOnce]);

  // Leaving the app ends an offer such as Undo rather than leaving it hanging.
  const hasAction = Boolean(action || props.secondaryAction);
  useEffect(() => {
    if (!current || !hasAction) return;
    const hidden = () => {
      if (document.visibilityState === 'hidden') settleOnce();
    };
    const leave = () => settleOnce();
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', leave);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', leave);
    };
  }, [current, hasAction, settleOnce]);

  const state = clock.current;
  const elapsed = !Object.is(state.id, id)
    ? 0
    : state.used + (state.since === null ? 0 : Date.now() - state.since);
  return (
    <ToastCard
      key={id ?? ''}
      variant={variant}
      durationMs={durationMs}
      message={message}
      lines={props.lines}
      action={action}
      secondaryAction={props.secondaryAction}
      busy={busy}
      dismissLabel={props.dismissLabel ?? 'Dismiss notification'}
      paused={!running}
      startOffset={elapsed}
      onHeld={setHeld}
      onDismiss={() => latest.current.onDismiss()}
    />
  );
}

// ───────── The shared slot ─────────

interface SlotEntry {
  settle: () => void;
  dismiss: () => void;
}

interface ToastSlot {
  current: object | null;
  viewport: HTMLElement | null;
  claim: (key: object, entry: SlotEntry) => void;
  release: (key: object) => void;
  place: (key: object, placement: { edge: ToastEdge; bottomOffset?: string } | null) => void;
}

interface ShownToast {
  key: number;
  options: ToastOptions;
}

const ToastSlotContext = createContext<ToastSlot | null>(null);

const noToastApi: ToastApi = { show: () => undefined, dismiss: () => undefined, active: false };
const ToastApiContext = createContext<ToastApi>(noToastApi);

/** One toast on screen at a time; the newest replaces the current one, which settles. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [holder, setHolder] = useState<object | null>(null);
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const currentRef = useRef<{ key: object; entry: SlotEntry } | null>(null);
  const settled = useRef(new WeakSet<object>());

  const claim = useCallback((key: object, entry: SlotEntry) => {
    // A replaced toast stays settled until its owner gives it a new id.
    if (settled.current.has(key)) return;
    const previous = currentRef.current;
    if (previous?.key === key) {
      previous.entry = entry;
      return;
    }
    currentRef.current = { key, entry };
    setHolder(key);
    if (previous) {
      settled.current.add(previous.key);
      previous.entry.settle();
    }
  }, []);

  const release = useCallback((key: object) => {
    if (currentRef.current?.key !== key) return;
    currentRef.current = null;
    setHolder(null);
  }, []);

  const [placements, setPlacements] = useState<
    { key: object; edge: ToastEdge; bottomOffset?: string }[]
  >([]);
  const place = useCallback<ToastSlot['place']>((key, placement) => {
    setPlacements((list) => {
      const rest = list.filter((item) => item.key !== key);
      return placement ? [...rest, { key, ...placement }] : rest;
    });
  }, []);
  const placement = placements.at(-1);

  const [shown, setShown] = useState<ShownToast | null>(null);
  const shownRef = useRef<ShownToast | null>(null);
  const shownCount = useRef(0);
  const show = useCallback((toast: string | ToastOptions) => {
    shownCount.current += 1;
    const previous = shownRef.current?.options;
    shownRef.current = {
      key: shownCount.current,
      options: typeof toast === 'string' ? { message: toast } : toast,
    };
    setShown(shownRef.current);
    if (previous) (previous.onTimeout ?? previous.onDismiss)?.();
  }, []);
  const finish = useCallback((toast: ShownToast, timedOut: boolean) => {
    if (shownRef.current === toast) {
      shownRef.current = null;
      setShown(null);
    }
    const { onTimeout, onDismiss } = toast.options;
    (timedOut ? (onTimeout ?? onDismiss) : onDismiss)?.();
  }, []);

  const dismiss = useCallback(() => currentRef.current?.entry.dismiss(), []);
  const slot = useMemo<ToastSlot>(
    () => ({ current: holder, viewport, claim, release, place }),
    [holder, viewport, claim, release, place],
  );
  // A shown toast counts before it takes the slot, so nothing opens over it in the meantime.
  const active = holder !== null || shown !== null;
  const api = useMemo<ToastApi>(() => ({ show, dismiss, active }), [show, dismiss, active]);

  return (
    <ToastApiContext.Provider value={api}>
      <ToastSlotContext.Provider value={slot}>
        {children}
        <ToastViewport
          edge={placement?.edge ?? 'top'}
          bottomOffset={placement?.bottomOffset}
          onElement={setViewport}
        />
        {shown && (
          <Toast
            key={shown.key}
            {...shown.options}
            onTimeout={() => finish(shown, true)}
            onDismiss={() => finish(shown, false)}
          />
        )}
      </ToastSlotContext.Provider>
    </ToastApiContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  return useContext(ToastApiContext);
}

/**
 * Docks toasts at the bottom while the calling screen is showing (the live workout logger), above
 * its rest dock. `bottomOffset` is a CSS length. The last screen to call it wins.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useToastPlacement(edge: ToastEdge, bottomOffset?: string) {
  const slot = useContext(ToastSlotContext);
  const place = slot?.place;
  const [key] = useState(() => ({}));
  useLayoutEffect(() => {
    if (!place) return;
    place(key, { edge, bottomOffset });
    return () => place(key, null);
  }, [place, key, edge, bottomOffset]);
}

function SlottedToast({ slot, props }: { slot: ToastSlot; props: ToastProps }) {
  const { id } = props;
  const key = useMemo(() => ({ id }), [id]);
  const latest = useRef(props);
  latest.current = props;
  const { claim, release } = slot;
  useLayoutEffect(() => {
    claim(key, {
      settle: () => settle(latest.current),
      dismiss: () => latest.current.onDismiss(),
    });
    return () => release(key);
  }, [claim, release, key]);
  const current = slot.current === key;
  const card = useToastCard(props, current);
  return current && slot.viewport ? createPortal(card, slot.viewport) : null;
}

function StandaloneToast({ props }: { props: ToastProps }) {
  const card = useToastCard(props, true);
  return <ToastViewport edge="top">{card}</ToastViewport>;
}

/**
 * A brief notice that floats over the page and clears itself. Inside `ToastProvider` it takes the
 * shared slot, replacing the toast on screen; without one (isolated tests) it shows on its own.
 */
export function Toast(props: ToastProps) {
  const slot = useContext(ToastSlotContext);
  return slot ? <SlottedToast slot={slot} props={props} /> : <StandaloneToast props={props} />;
}
