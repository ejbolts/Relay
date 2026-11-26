import { POPUP_MS } from './popupTiming';

/*
 * Whether Relay can reach its server, shown to the person only once an outage has lasted. Shared by
 * the web and the app: each gives it its own way to tell the device is offline, to ask the server,
 * and to hear the device go on- or offline.
 *
 * online ──failure──▶ checking (silent, retries with backoff) ──20 s, 2+ failures──▶ offline
 *    ▲                    │ any answer                                                │ any answer,
 *    └────────────────────┘                                    after showing for 4 s ▼
 *    └──────────────────────────────── 2.5 s ◀──────────────────────────────────── back
 *
 * A small server can be slow, and a gym signal drops for a few seconds at a time; neither should
 * tell anyone they are offline.
 */

export type ConnectionPhase = 'online' | 'checking' | 'offline' | 'back';
/** `device`: the phone itself has no connection. `server`: the phone is online but Relay is not answering. */
export type OfflineCause = 'device' | 'server';
/**
 * What the last failed attempt showed about the server: `down` when a proxy in front of Relay
 * answered that it is not running (502–504), `unreachable` when nothing answered at all.
 */
export type ServerProblem = 'down' | 'unreachable';

export interface ConnectionState {
  phase: ConnectionPhase;
  cause: OfflineCause;
  server: ServerProblem;
  /** When the server last answered, as epoch milliseconds; null if it has not this session. */
  lastReachedAt: number | null;
}

/** Progress of the quiet checks, which only the open details show. */
export interface ConnectionCheck {
  /** A check is in flight. */
  checking: boolean;
  /** When the next check runs, as epoch milliseconds; null if none is scheduled. */
  nextCheckAt: number | null;
}

/** `true` when the server answered; otherwise what the failure showed. `false` reads as unreachable. */
export type CheckOutcome = boolean | ServerProblem;

/** An outage must last this long, with at least two failed attempts, before it is shown. */
export const CONFIRM_OFFLINE_MS = 20_000;
/** Quiet checks after a failure back off like this, then repeat the last delay. */
export const CHECK_BACKOFF_MS = [2_000, 4_000, 8_000] as const;
/** How often a confirmed outage checks whether the server is back. */
export const OFFLINE_CHECK_MS = 10_000;
/** A check that has not answered in this time counts as a failure. */
export const CHECK_TIMEOUT_MS = 8_000;
/** Once shown, the offline notice stays at least this long, so it never flashes. */
export const MIN_OFFLINE_SHOWN_MS = 4_000;
/** How long "Back online" shows before it leaves: a quick pop-up. */
export const BACK_ONLINE_MS = POPUP_MS.quick;
/** A slow read checks the connection at most this often while the server seems fine. */
const VERIFY_SLOW_EVERY_MS = 15_000;
/** The server's health check, which each app asks in its own way. */
export const HEALTH_PATH = '/api/health';
/** Proxy answers meaning Relay itself is not running. */
export const GATEWAY_FAILURES: ReadonlySet<number> = new Set([502, 503, 504]);

/** What the device tells the monitor while something shows the status. */
export interface ConnectionEvents {
  /** The device lost its connection. */
  offline: () => void;
  /** The device has a connection again. */
  online: () => void;
  /** The app came back to the foreground. */
  wake: () => void;
}

export interface ConnectionEnvironment {
  /** The device itself reports no connection. */
  deviceOffline: () => boolean;
  /** Asks the server once. */
  check: () => Promise<CheckOutcome>;
  /** Starts hearing the device while something shows the status; returns how to stop. */
  listen: (events: ConnectionEvents) => () => void;
}

const INITIAL: ConnectionState = {
  phase: 'online',
  cause: 'server',
  server: 'unreachable',
  lastReachedAt: null,
};
const IDLE: ConnectionCheck = { checking: false, nextCheckAt: null };

export type ConnectionMonitor = ReturnType<typeof createConnectionMonitor>;

/** One connection monitor for an app, with that app's way to sense the device and the server. */
export function createConnectionMonitor(environment: ConnectionEnvironment) {
  let state = INITIAL;
  /** What the person sees: the same as `state`, except that silent checking reads as online. */
  let view = INITIAL;
  let progress = IDLE;
  let lastReachedAt: number | null = null;
  let outageStart: number | null = null;
  let failures = 0;
  let shownAt = 0;
  let lastVerifyAt = -Infinity;
  let checkInFlight = false;
  let generation = 0;
  let checkTimer: ReturnType<typeof setTimeout> | undefined;
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;
  let phaseTimer: ReturnType<typeof setTimeout> | undefined;
  let stopListening: (() => void) | undefined;
  let runCheck = environment.check;
  const listeners = new Set<() => void>();
  const progressListeners = new Set<() => void>();

  const deviceOffline = () => environment.deviceOffline();
  const currentCause = (): OfflineCause => (deviceOffline() ? 'device' : 'server');

  function update(patch: Partial<ConnectionState>): void {
    state = { ...state, ...patch };
    const next: ConnectionState =
      state.phase === 'checking' ? { ...state, phase: 'online', lastReachedAt: null } : state;
    // Silent checks must not re-render anything; only a change the person can see notifies.
    if (
      next.phase === view.phase &&
      (next.phase === 'online' ||
        (next.cause === view.cause &&
          next.server === view.server &&
          next.lastReachedAt === view.lastReachedAt))
    )
      return;
    view = next.phase === 'online' ? INITIAL : next;
    for (const listener of listeners) listener();
  }

  function updateProgress(patch: Partial<ConnectionCheck>): void {
    const next = { ...progress, ...patch };
    if (next.checking === progress.checking && next.nextCheckAt === progress.nextCheckAt) return;
    progress = next;
    for (const listener of progressListeners) listener();
  }

  /** Checks run only while something shows the status, so background tests and startup stay quiet. */
  const watched = () => listeners.size > 0;

  function scheduleCheck(delay: number): void {
    if (!watched() || checkInFlight) return;
    const at = Date.now() + delay;
    if (checkTimer !== undefined && progress.nextCheckAt !== null && progress.nextCheckAt <= at)
      return;
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      checkTimer = undefined;
      void check();
    }, delay);
    updateProgress({ nextCheckAt: at });
  }

  function scheduleConfirm(): void {
    if (!watched() || confirmTimer !== undefined || outageStart === null) return;
    confirmTimer = setTimeout(
      () => {
        confirmTimer = undefined;
        confirm();
      },
      Math.max(0, outageStart + CONFIRM_OFFLINE_MS - Date.now()),
    );
  }

  function confirm(): void {
    if (!watched() || state.phase !== 'checking' || outageStart === null) return;
    if (Date.now() - outageStart < CONFIRM_OFFLINE_MS || failures < 2) return;
    shownAt = Date.now();
    update({ phase: 'offline', cause: currentCause(), lastReachedAt });
    if (!checkInFlight && progress.nextCheckAt === null) scheduleCheck(OFFLINE_CHECK_MS);
  }

  async function check(): Promise<void> {
    if (checkInFlight) return;
    clearTimeout(checkTimer);
    checkTimer = undefined;
    checkInFlight = true;
    const started = generation;
    updateProgress({ checking: true, nextCheckAt: null });
    // Without a connection there is nothing to ask; it still counts as a failed attempt.
    const outcome = deviceOffline() ? false : await runCheck().catch(() => false);
    if (started !== generation) return;
    checkInFlight = false;
    updateProgress({ checking: false });
    if (outcome === true) reached();
    else reportConnectionFailure(outcome === false ? 'unreachable' : outcome);
  }

  /**
   * A request could not reach the server: `unreachable` for no connection or a timeout, `down` for
   * a proxy answering 502–504.
   */
  function reportConnectionFailure(problem: ServerProblem = 'unreachable'): void {
    failures += 1;
    outageStart ??= Date.now();
    clearTimeout(phaseTimer);
    phaseTimer = undefined;
    if (state.phase === 'online' || state.phase === 'back') {
      update({ phase: 'checking', cause: currentCause(), server: problem, lastReachedAt });
    } else if (state.server !== problem) update({ server: problem });
    if (state.phase === 'checking') {
      confirm();
      scheduleConfirm();
    }
    const delay =
      state.phase === 'offline'
        ? OFFLINE_CHECK_MS
        : CHECK_BACKOFF_MS[Math.min(failures - 1, CHECK_BACKOFF_MS.length - 1)];
    scheduleCheck(delay);
  }

  function showBack(): void {
    phaseTimer = setTimeout(() => {
      phaseTimer = undefined;
      update({ phase: 'online' });
    }, BACK_ONLINE_MS);
    updateProgress({ nextCheckAt: null });
    update({ phase: 'back' });
  }

  function reached(): void {
    lastReachedAt = Date.now();
    if (state.phase === 'online' && outageStart === null) return;
    outageStart = null;
    failures = 0;
    clearTimeout(checkTimer);
    checkTimer = undefined;
    clearTimeout(confirmTimer);
    confirmTimer = undefined;
    if (state.phase === 'offline') {
      if (phaseTimer !== undefined) return;
      const wait = shownAt + MIN_OFFLINE_SHOWN_MS - Date.now();
      updateProgress({ nextCheckAt: null });
      if (wait > 0) {
        phaseTimer = setTimeout(() => {
          phaseTimer = undefined;
          showBack();
        }, wait);
      } else showBack();
      return;
    }
    updateProgress({ nextCheckAt: null });
    if (state.phase === 'checking') update({ phase: 'online', lastReachedAt });
  }

  /** A slow answer may mean the connection has gone; check quietly, without telling anyone yet. */
  function verifyConnection(): void {
    if (!watched() || state.phase !== 'online' || checkInFlight) return;
    const now = Date.now();
    if (now - lastVerifyAt < VERIFY_SLOW_EVERY_MS) return;
    lastVerifyAt = now;
    void check();
  }

  /** Runs a check straight away, for the "Try now" button. */
  function checkConnectionNow(): void {
    if (checkInFlight) return;
    void check();
  }

  const events: ConnectionEvents = {
    offline: () => {
      reportConnectionFailure();
      if (state.phase === 'offline') update({ cause: 'device' });
    },
    online: () => {
      if (state.phase === 'offline') update({ cause: 'server' });
      if (state.phase === 'checking' || state.phase === 'offline') scheduleCheck(0);
    },
    wake: () => {
      if (state.phase === 'checking' || state.phase === 'offline') scheduleCheck(0);
    },
  };

  function start() {
    stopListening = environment.listen(events);
    // Opening the app without a connection fires no event, so look once.
    if (deviceOffline()) reportConnectionFailure();
    else if (state.phase === 'checking') {
      scheduleConfirm();
      scheduleCheck(CHECK_BACKOFF_MS[0]);
    }
  }

  /** With nothing showing the status, forget the outage; the next viewer starts afresh. */
  function forgetOutage() {
    generation += 1;
    clearTimeout(checkTimer);
    clearTimeout(confirmTimer);
    clearTimeout(phaseTimer);
    checkTimer = confirmTimer = phaseTimer = undefined;
    checkInFlight = false;
    outageStart = null;
    failures = 0;
    shownAt = 0;
  }

  function stop() {
    stopListening?.();
    stopListening = undefined;
    forgetOutage();
    state = view = INITIAL;
    progress = IDLE;
  }

  return {
    reportConnectionFailure,
    /** Any answer from the server means the app is live again. */
    reportServerReached: reached,
    verifyConnection,
    checkConnectionNow,
    /** Replaces the server check, for tests; call with no argument to restore the app's own. */
    setCheck(next?: () => Promise<CheckOutcome>) {
      runCheck = next ?? environment.check;
    },
    /** Hears changes the person can see; the first listener starts the quiet checks. */
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    subscribeProgress(listener: () => void) {
      progressListeners.add(listener);
      return () => void progressListeners.delete(listener);
    },
    /** The full state, including silent checking. */
    state: () => state,
    /** The connection as the person should see it: silent checking reads as online. */
    view: () => view,
    progress: () => progress,
    /** Forgets every outage and timer, for tests. */
    reset() {
      forgetOutage();
      lastVerifyAt = -Infinity;
      lastReachedAt = null;
      updateProgress(IDLE);
      update(INITIAL);
    },
  };
}

export const INITIAL_CONNECTION = INITIAL;
export const IDLE_CONNECTION_CHECK = IDLE;

/*
 * The notice both apps show: a pill at the top that says what is wrong, shrinks to an icon, opens
 * the details, and confirms when the app is back.
 */

/**
 * The notice says what happened for the standard pop-up time, then shrinks to an icon, so it
 * never needs closing.
 */
export const MINIMISE_AFTER_MS = POPUP_MS.standard;

const NOTICE_LABELS: Record<OfflineCause, string> = {
  device: 'No internet',
  server: 'Offline',
};

/** Whether the notice shows at all. */
export function offlineNoticeVisible(connection: ConnectionState): boolean {
  return connection.phase === 'offline' || connection.phase === 'back';
}

/** What the notice's pill says, and what a screen reader hears. */
export function offlineNoticeLabel(connection: ConnectionState): string {
  return connection.phase === 'back' ? 'Back online' : NOTICE_LABELS[connection.cause];
}

/** Changes saved on this phone that have not reached the server yet. */
export interface WaitingToSync {
  workouts: number;
  checkIns: number;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** When the server last answered: the time today, else the weekday and time. */
export function formatLastConnected(at: number, now = Date.now()): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === new Date(now).toDateString()) return time;
  return `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

export interface ConnectionDetailRow {
  label: string;
  value: string;
  /** A status dot: green `ok`, red `bad`; none for plain values. */
  state?: 'ok' | 'bad';
}

/** The rows of the open details, in order. */
export function connectionDetailRows(
  connection: ConnectionState,
  waiting: WaitingToSync,
  now = Date.now(),
): ConnectionDetailRow[] {
  const rows: ConnectionDetailRow[] = [
    {
      label: 'Internet',
      value: connection.cause === 'server' ? 'Connected' : 'Not connected',
      state: connection.cause === 'server' ? 'ok' : 'bad',
    },
  ];
  // With no internet there is no way to know how the server is.
  if (connection.cause === 'server')
    rows.push({
      label: 'Server',
      value: connection.server === 'down' ? 'Offline' : 'Unreachable',
      state: 'bad',
    });
  if (connection.lastReachedAt !== null)
    rows.push({
      label: 'Last connected',
      value: formatLastConnected(connection.lastReachedAt, now),
    });
  const saved = [
    waiting.workouts > 0 && count(waiting.workouts, 'workout', 'workouts'),
    waiting.checkIns > 0 && count(waiting.checkIns, 'check-in', 'check-ins'),
  ].filter(Boolean);
  if (saved.length > 0) rows.push({ label: 'Saved on this phone', value: saved.join(' · ') });
  return rows;
}

/** The line beside Try now: a check in flight, or the seconds to the next one. */
export function nextCheckText(progress: ConnectionCheck, now = Date.now()): string {
  if (progress.checking) return 'Checking…';
  if (progress.nextCheckAt === null) return '';
  const seconds = Math.max(1, Math.ceil((progress.nextCheckAt - now) / 1000));
  return `Next check in ${seconds} s`;
}
