import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
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
import { ApiError, serverOrigin } from './api';

// The app's side of the shared connection monitor (frontend/src/connectionMonitor.ts), which holds
// the web's outage rules and timings. The phone's connection comes from NetInfo through React
// Query's onlineManager (data/queryClient.ts); the server's from the app's own requests and the
// health check.

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

/** The app's requests throw this message when nothing answered (data/api.ts). */
const UNREACHABLE = /^Could not reach Relay\b/;

/** What a failed request says about the server: nothing, a down server, or none reached. */
function reportRequestError(error: unknown) {
  if (error instanceof ApiError) {
    if (GATEWAY_FAILURES.has(error.status)) connection.reportConnectionFailure('down');
    // Any other answer came from Relay itself.
    else connection.reportServerReached();
  } else if (error instanceof Error && UNREACHABLE.test(error.message)) {
    connection.reportConnectionFailure('unreachable');
  }
}

/**
 * Feeds the monitor from the app's own reads and saves, as the web's api.ts does: an answer to a
 * read means Relay is reachable, and every request that reached nothing counts as a failure.
 */
export function useConnectionReports(client: QueryClient) {
  useEffect(() => {
    const queries = client.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      const { action } = event;
      // A manual success is the app writing the cache itself (setQueryData), not an answer.
      if (action.type === 'success' && !action.manual) connection.reportServerReached();
      else if (action.type === 'failed' || action.type === 'error')
        reportRequestError(action.error);
    });
    // A save can succeed on the phone alone (a check-in or workout queued offline), so only a
    // save's failure says anything about the connection.
    const mutations = client.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      const { action } = event;
      if (action.type === 'failed' || action.type === 'error') reportRequestError(action.error);
    });
    return () => {
      queries();
      mutations();
    };
  }, [client]);
}

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
