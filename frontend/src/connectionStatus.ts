import { useSyncExternalStore } from 'react';
import {
  CHECK_TIMEOUT_MS,
  createConnectionMonitor,
  GATEWAY_FAILURES,
  HEALTH_PATH,
  IDLE_CONNECTION_CHECK,
  INITIAL_CONNECTION,
  type CheckOutcome,
  type ConnectionCheck,
  type ConnectionState,
  type ServerProblem,
} from './connectionMonitor';

export {
  BACK_ONLINE_MS,
  CHECK_BACKOFF_MS,
  CHECK_TIMEOUT_MS,
  CONFIRM_OFFLINE_MS,
  MIN_OFFLINE_SHOWN_MS,
  OFFLINE_CHECK_MS,
  type CheckOutcome,
  type ConnectionCheck,
  type ConnectionPhase,
  type ConnectionState,
  type OfflineCause,
  type ServerProblem,
} from './connectionMonitor';

let usingSavedData = false;
const savedCopies = new WeakSet<object>();

/**
 * Whether a read's answer is this device's saved copy, not the server's. A refresh checks each
 * of its reads, so it does not mark server data as loaded when a slow read showed an older saved
 * copy instead, and it knows which reads to ask for again.
 */
export function isSavedCopy(answer: unknown): boolean {
  return typeof answer === 'object' && answer !== null && savedCopies.has(answer);
}

/**
 * A screen is showing this device's saved copy, because the server was slow or could not be
 * reached. Slow is not the same as offline, so this only asks for a quiet connection check.
 * `copy` is the saved answer a read is about to return.
 */
export function reportSavedDataUsed(copy?: unknown): void {
  if (typeof copy === 'object' && copy !== null) savedCopies.add(copy);
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

// The outage rules live in connectionMonitor.ts, shared with the app; this is the browser's side:
// navigator.onLine, the window's online and offline events, the page becoming visible again, and
// fetching the health check.

function deviceOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

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

const monitor = createConnectionMonitor({
  deviceOffline,
  check: defaultCheck,
  listen: ({ offline, online, wake }) => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') wake();
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', onVisible);
    };
  },
});

/** Replaces the server check, for tests; call with no argument to restore the real one. */
export function setConnectionCheck(check?: () => Promise<CheckOutcome>): void {
  monitor.setCheck(check);
}

/**
 * A request could not reach the server: `unreachable` for no connection or a timeout, `down` for a
 * proxy answering 502–504.
 */
export function reportConnectionFailure(problem: ServerProblem = 'unreachable'): void {
  monitor.reportConnectionFailure(problem);
}

/** A slow answer may mean the connection has gone; check quietly, without telling anyone yet. */
function verifyConnection(): void {
  monitor.verifyConnection();
}

function reached(): void {
  monitor.reportServerReached();
}

/** Runs a check straight away, for the "Try now" button. */
export function checkConnectionNow(): void {
  monitor.checkConnectionNow();
}

/** The full state, including silent checking. */
export function connectionState(): ConnectionState {
  return monitor.state();
}

/**
 * The connection as the person should see it: silent checking reads as online. Subscribing also
 * starts the quiet checks.
 */
export function useConnectionState(): ConnectionState {
  return useSyncExternalStore(monitor.subscribe, monitor.view, () => INITIAL_CONNECTION);
}

export function useConnectionCheck(): ConnectionCheck {
  return useSyncExternalStore(
    monitor.subscribeProgress,
    monitor.progress,
    () => IDLE_CONNECTION_CHECK,
  );
}

/** Forgets every outage and timer, for tests. */
export function resetConnectionStatus(): void {
  monitor.reset();
  usingSavedData = false;
}
