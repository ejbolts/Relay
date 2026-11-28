// What each request to Relay showed about the connection, for the offline notice
// (data/connectionStatus.ts). No imports, so the request layer can report without depending on UI.

/** Relay answered (any status), or nothing answered at all (no connection or a timeout). */
export type RequestOutcome = { kind: 'answered'; status: number } | { kind: 'unreachable' };

const listeners = new Set<(outcome: RequestOutcome) => void>();

/** Hears every request's outcome; returns how to stop. */
export function onRequestOutcome(listener: (outcome: RequestOutcome) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Called by `request()` in data/api.ts once per request that went out. */
export function reportRequestOutcome(outcome: RequestOutcome) {
  for (const listener of listeners) listener(outcome);
}
