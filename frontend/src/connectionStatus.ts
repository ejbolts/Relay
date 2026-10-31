import { useSyncExternalStore } from 'react';

let usingSavedData = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** A screen is showing this device's saved copy because the server could not be reached. */
export function reportSavedDataUsed(): void {
  if (usingSavedData) return;
  usingSavedData = true;
  notify();
}

/** Any successful server answer means the app is live again. */
export function reportServerReached(): void {
  if (!usingSavedData) return;
  usingSavedData = false;
  notify();
}

export function isUsingSavedData(): boolean {
  return usingSavedData;
}

function browserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

const offlineSnapshot = () => usingSavedData || browserOffline();

/** True while the device has no connection or the app is working from saved data. */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribe, offlineSnapshot, () => false);
}
