import type { FetchStatus } from '@tanstack/react-query';

/** Shown where a screen can't load because the phone is offline and nothing is cached. */
export const OFFLINE_MESSAGE = "You're offline. Connect to the internet, then try again.";

/**
 * Whether a query is waiting for the network rather than loading. The app feeds NetInfo into
 * React Query's onlineManager (data/queryClient.ts), so offline with nothing cached a query is
 * paused: still pending, but no request will go out until the phone is back online. Screens that
 * show a spinner while pending should show an offline state instead.
 */
export function waitingForNetwork(query: { isPending: boolean; fetchStatus: FetchStatus }) {
  return query.isPending && query.fetchStatus === 'paused';
}

/**
 * The same for a query that shows placeholder data (such as the default workout types) until the
 * server answers: offline, the placeholder stays and the query waits for the network.
 */
export function placeholderWaitingForNetwork(query: {
  isPlaceholderData: boolean;
  fetchStatus: FetchStatus;
}) {
  return query.isPlaceholderData && query.fetchStatus === 'paused';
}
