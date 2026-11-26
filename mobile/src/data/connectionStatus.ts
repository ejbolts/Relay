import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
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
} from '../../../frontend/src/connectionMonitor';
import { serverOrigin } from './api';
import { onRequestOutcome, type RequestOutcome } from './requestOutcome';

// The app's side of the shared connection monitor (frontend/src/connectionMonitor.ts), which holds
// the web's outage rules and timings. The phone's connection comes from NetInfo through React
// Query's onlineManager (data/queryClient.ts); the server's from every request data/api.ts sends
// and from the health check.

async function askServer(): Promise<CheckOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(serverOrigin() + HEALTH_PATH, {
      credentials: 'omit',
      signal: controller.signal,
    });
    return GATEWAY_FAILURES.has(response.status) ? 'down' : true;
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

export const connection = createConnectionMonitor({
  deviceOffline: () => !onlineManager.isOnline(),
  check: askServer,
  listen: ({ offline, online, wake }) => {
    const net = onlineManager.subscribe((isOnline) => (isOnline ? online() : offline()));
    const app = AppState.addEventListener?.('change', (state) => {
      if (state === 'active') wake();
    });
    return () => {
      net();
      app?.remove();
    };
  },
});

/**
 * Every request to Relay reports what it showed, from data/api.ts's request layer as the web's
 * api.ts does: any answer means Relay is reachable, except a proxy saying it is down (502–504); a
 * request that reached nothing is a failure. A caller's cancel reports nothing. Requests that a
 * screen then turns into data of its own (a fallback) still report what really happened, so a
 * swallowed failure can never read as Relay answering. React Query's caches are not listened to:
 * every read and save goes through this layer, and hearing both would count each failure twice.
 */
export function reportRequestOutcome(outcome: RequestOutcome) {
  if (outcome.kind === 'unreachable') connection.reportConnectionFailure('unreachable');
  else if (GATEWAY_FAILURES.has(outcome.status)) connection.reportConnectionFailure('down');
  else connection.reportServerReached();
}
onRequestOutcome(reportRequestOutcome);

/** The connection as the person should see it. Subscribing also starts the quiet checks. */
export function useConnectionState(): ConnectionState {
  return useSyncExternalStore(connection.subscribe, connection.view, () => INITIAL_CONNECTION);
}

export function useConnectionCheck(): ConnectionCheck {
  return useSyncExternalStore(
    connection.subscribeProgress,
    connection.progress,
    () => IDLE_CONNECTION_CHECK,
  );
}
