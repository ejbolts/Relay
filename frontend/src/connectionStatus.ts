import { useSyncExternalStore } from 'react';

let usingSavedData = false;
let savedAnswers = 0;

/**
 * How many reads have answered from saved copies. A refresh compares this before and after, so
 * it does not mark server data as loaded when a slow read showed an older saved copy instead.
 */
export function savedDataAnswerCount(): number {
  return savedAnswers;
}

/**
 * A screen is showing this device's saved copy, because the server was slow or could not be
 * reached. Slow is not the same as offline, so this only asks for a quiet connection check.
 */
export function reportSavedDataUsed(): void {
  savedAnswers += 1;
  usingSavedData = true;
  verifyConnection();
}

/** Any answer from the server means the app is live again. */
export function reportServerReached(): void {
  usingSavedData = false;
  reached();
}

export function isUsingSavedData(): boolean {
  return usingSavedData;
}

/*
 * Whether Relay can reach its server, shown to the person only once an outage has lasted.
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
/** How long "Back online" shows before it leaves. */
export const BACK_ONLINE_MS = 2_500;
/** A slow read checks the connection at most this often while the server seems fine. */
const VERIFY_SLOW_EVERY_MS = 15_000;
const HEALTH_PATH = '/api/health';
const GATEWAY_FAILURES = new Set([502, 503, 504]);

function deviceOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

const currentCause = (): OfflineCause => (deviceOffline() ? 'device' : 'server');

const INITIAL: ConnectionState = {
  phase: 'online',
  cause: 'server',
  server: 'unreachable',
  lastReachedAt: null,
};
const IDLE: ConnectionCheck = { checking: false, nextCheckAt: null };

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
const listeners = new Set<() => void>();
const progressListeners = new Set<() => void>();

/** `true` when the server answered; otherwise what the failure showed. `false` reads as unreachable. */
type CheckOutcome = boolean | ServerProblem;

async function defaultCheck(): Promise<CheckOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(HEALTH_PATH, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    return GATEWAY_FAILURES.has(response.status) ? 'down' : true;
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

let runCheck: () => Promise<CheckOutcome> = defaultCheck;

/** Replaces the server check, for tests; call with no argument to restore the real one. */
export function setConnectionCheck(check?: () => Promise<CheckOutcome>): void {
  runCheck = check ?? defaultCheck;
}

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
 * A request could not reach the server: `unreachable` for no connection or a timeout, `down` for a
 * proxy answering 502–504.
 */
export function reportConnectionFailure(problem: ServerProblem = 'unreachable'): void {
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
export function checkConnectionNow(): void {
  if (checkInFlight) return;
  void check();
}

function onOffline() {
  reportConnectionFailure();
  if (state.phase === 'offline') update({ cause: 'device' });
}

function onOnline() {
  if (state.phase === 'offline') update({ cause: 'server' });
  if (state.phase === 'checking' || state.phase === 'offline') scheduleCheck(0);
}

function onVisible() {
  if (document.visibilityState !== 'visible') return;
  if (state.phase === 'checking' || state.phase === 'offline') scheduleCheck(0);
}

function start() {
  window.addEventListener('offline', onOffline);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
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
  window.removeEventListener('offline', onOffline);
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onVisible);
  forgetOutage();
  state = view = INITIAL;
  progress = IDLE;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

/** The full state, including silent checking. */
export function connectionState(): ConnectionState {
  return state;
}

const viewSnapshot = () => view;

/**
 * The connection as the person should see it: silent checking reads as online. Subscribing also
 * starts the quiet checks.
 */
export function useConnectionState(): ConnectionState {
  return useSyncExternalStore(subscribe, viewSnapshot, () => INITIAL);
}

function subscribeProgress(listener: () => void) {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

const progressSnapshot = () => progress;

export function useConnectionCheck(): ConnectionCheck {
  return useSyncExternalStore(subscribeProgress, progressSnapshot, () => IDLE);
}

/** Forgets every outage and timer, for tests. */
export function resetConnectionStatus(): void {
  forgetOutage();
  lastVerifyAt = -Infinity;
  lastReachedAt = null;
  usingSavedData = false;
  updateProgress(IDLE);
  update(INITIAL);
}
