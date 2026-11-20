import type { SharedProfileSummary } from './types';

/** A person to open, such as someone named in a notification. */
export type SharedProfileRequest = Pick<SharedProfileSummary, 'id' | 'display_name'>;

const listeners = new Set<(profile: SharedProfileRequest) => void>();

/** Asks the app to open a person's shared profile (or your own Profile). */
export function requestSharedProfile(profile: SharedProfileRequest): void {
  listeners.forEach((listener) => listener(profile));
}

/** Runs when a profile is requested, for the app to switch to it. */
export function onSharedProfileRequested(
  listener: (profile: SharedProfileRequest) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
